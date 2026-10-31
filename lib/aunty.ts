import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { forbidden, type Actor } from "@/lib/api";
import { awsClientConfig } from "@/lib/aws";
import { db } from "@/lib/db";

/**
 * AI Aunty: a private yarn between one person and a chatbot that speaks like a
 * community Aunty.
 *
 * Two boundaries hold this feature up, and both are enforced here rather than
 * in the UI:
 *
 * 1. **Elders govern the voice, not the content.** A group has no Aunty until
 *    its Elders switch one on, and the brief they write is folded into every
 *    prompt. No endpoint returns anyone else's thread, so Elders cannot read
 *    the yarns their decision enabled.
 * 2. **The Aunty steps back from anything that needs a real person.** Health,
 *    sorry business and crisis talk hand over instead of being answered.
 *
 * Inference runs on Amazon Bedrock in ap-southeast-2, called from the Worker
 * (or the Docker image locally) with credentials from lib/aws.ts. Point
 * `BEDROCK_MODEL_ID` at a Sydney inference profile, not a global one, or the
 * model call itself can be served outside Australia.
 */

/**
 * No default. Newer Bedrock models are only reachable through a cross-region
 * inference profile (the base model ID returns 400), and the right profile
 * depends on the account's enabled models — so guessing one here would fail at
 * runtime in a way that looks like a bug. Unset means "no model", which falls
 * back to the canned replies below, exactly as unset SNS credentials fall back
 * to the outbox in lib/notify.ts.
 */
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID;

/** How much of the yarn is replayed to the model. Keeps us inside the context window. */
const HISTORY_LIMIT = 20;

export type HandoffKind = "health" | "sorry_business" | "crisis" | "elder";

export type AuntyReply = {
  body: string;
  handoff: HandoffKind | null;
  mocked: boolean;
};

/** One turn of the yarn, in Bedrock Converse's shape. */
type ChatTurn = { role: "user" | "assistant"; text: string };

// ---------- Persona and guardrails ----------

/**
 * The Aunty's standing instructions.
 *
 * `guidance` is whatever the group's Elders wrote in the portal, in their own
 * words. It goes last so it outranks the defaults above it: if the Elders say
 * something different from this prompt, the Elders win.
 */
export function auntyPersona(guidance: string | null | undefined, memberName: string) {
  const base = [
    "You are Aunty, a warm older woman yarning with someone from her community in an Australian Aboriginal and Torres Strait Islander community app called MyMob.",
    `You are talking with ${memberName}.`,
    "",
    "How you talk:",
    "- Short, plain, warm. Two or three sentences is usually plenty.",
    "- Everyday Australian English. You can say 'bub', 'bub girl', 'my girl', 'bub boy', 'deadly', 'no worries' if it fits, but do not lay it on thick.",
    "- Ask one gentle question back rather than giving a list of advice.",
    "- Never use dot points, headings or emoji.",
    "",
    "What you are not:",
    "- You are not a real Elder and you never pretend to be. If someone asks, say plainly that you are a computer helper the Elders switched on, and that the real Aunties and Uncles are the ones to yarn with.",
    "- You do not speak for any community, do not share cultural knowledge, law, stories, songs or ceremony, and do not guess at anyone's Country, language group or kinship. If asked, point them to their Elders.",
    "- You are not a doctor, nurse or counsellor.",
    "",
    "When to step back:",
    "- Health questions, symptoms, medicines, test results: hand over, end your reply with [[handoff:health]].",
    "- Sorry business, funerals, someone who has passed: be gentle, say little, end with [[handoff:sorry_business]].",
    "- Culture, Country, language, ceremony, community decisions: end with [[handoff:elder]].",
    "Put the marker on its own line at the very end. Say your piece first, warmly, then the marker.",
  ].join("\n");

  const elders = guidance?.trim()
    ? ["", "The Elders of this community have told you:", guidance.trim()].join("\n")
    : "";

  return base + elders;
}

/**
 * Crisis terms that must never depend on the model behaving. Checked against
 * the person's own words before anything is sent for inference; on a match the
 * model is not called at all and the handover card is returned directly.
 */
const CRISIS_PATTERNS = [
  /\bkill(ing)?\s+(myself|my self)\b/i,
  /\bend(ing)?\s+(it|my life)\b/i,
  /\b(suicide|suicidal)\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bhurt(ing)?\s+myself\b/i,
  /\bself[-\s]?harm\b/i,
  /\bno\s+reason\s+to\s+(live|go on)\b/i,
];

export function isCrisis(text: string) {
  return CRISIS_PATTERNS.some((p) => p.test(text));
}

const CRISIS_REPLY =
  "I'm really glad you told me, and I'm not the right one to carry this with you. " +
  "Please ring 13YARN on 13 92 76 — it's a yarn with an Aboriginal or Torres Strait Islander crisis supporter, any time of day or night. " +
  "Lifeline is 13 11 14. If you're not safe right now, ring 000. " +
  "Can you also reach out to someone close to you tonight?";

const HANDOFF_MARKER = /\[\[handoff:(health|sorry_business|crisis|elder)\]\]/i;

/** Pulls the model's trailing marker off the reply and returns both halves. */
export function splitHandoff(raw: string): { body: string; handoff: HandoffKind | null } {
  const match = raw.match(HANDOFF_MARKER);
  const body = raw.replace(HANDOFF_MARKER, "").trim();
  return {
    body,
    handoff: match ? (match[1].toLowerCase() as HandoffKind) : null,
  };
}

// ---------- Inference ----------

/**
 * Canned replies for when no Bedrock model is configured, so the demo still runs
 * on a plane. Mirrors lib/notify.ts, where unset credentials fall back to the
 * outbox rather than failing.
 */
function mockReply(question: string): AuntyReply {
  const { handoff } = guessTopic(question);
  const body =
    handoff === "health"
      ? "That's one for the clinic, bub — they'll know what they're looking at. Have you got someone who can go in with you?"
      : handoff === "sorry_business"
        ? "Oh bub. I'm sorry. Sit with your people on this one, not with me."
        : handoff === "elder"
          ? "That's not mine to tell, my girl. Go and sit with the Aunties and Uncles — they hold that one."
          : "I hear you. Tell me a bit more about what's going on for you.";
  return { body, handoff, mocked: true };
}

/** Rough topic sniff, used only for the mock path. The model does its own. */
function guessTopic(text: string): { handoff: HandoffKind | null } {
  if (/\b(sick|pain|doctor|clinic|medicine|medication|blood|sugar|test|hospital)\b/i.test(text)) {
    return { handoff: "health" };
  }
  if (/\b(funeral|sorry business|passed away|passing|buried|died)\b/i.test(text)) {
    return { handoff: "sorry_business" };
  }
  if (/\b(country|ceremony|dreaming|totem|language|skin name|lore|law)\b/i.test(text)) {
    return { handoff: "elder" };
  }
  return { handoff: null };
}

let bedrock: BedrockRuntimeClient | undefined;

async function runBedrock(system: string, turns: ChatTurn[]): Promise<string> {
  if (!BEDROCK_MODEL_ID) throw new Error("not configured");
  bedrock ??= new BedrockRuntimeClient(awsClientConfig());

  const res = await bedrock.send(
    new ConverseCommand({
      modelId: BEDROCK_MODEL_ID,
      system: [{ text: system }],
      messages: turns.map((t) => ({
        role: t.role,
        content: [{ text: t.text }],
      })),
      inferenceConfig: { maxTokens: 300, temperature: 0.6 },
    }),
  );

  const content = res.output?.message?.content
    ?.map((block) => block.text ?? "")
    .join("")
    .trim();
  if (!content) throw new Error("Bedrock returned no content");
  return content;
}

/** Builds the prompt, calls the model, and falls back to a canned reply. */
export async function askAunty(
  question: string,
  history: { author: "member" | "aunty"; body: string }[],
  guidance: string | null,
  memberName: string,
): Promise<AuntyReply> {
  if (isCrisis(question)) return { body: CRISIS_REPLY, handoff: "crisis", mocked: false };

  const turns: ChatTurn[] = history.slice(-HISTORY_LIMIT).map((m) => ({
    role: m.author === "aunty" ? ("assistant" as const) : ("user" as const),
    text: m.body,
  }));
  // Converse rejects a conversation that opens on the assistant, which a
  // window boundary can produce.
  while (turns[0]?.role === "assistant") turns.shift();
  turns.push({ role: "user", text: question });

  try {
    const raw = await runBedrock(auntyPersona(guidance, memberName), turns);
    const { body, handoff } = splitHandoff(raw);
    return { body, handoff, mocked: false };
  } catch (err) {
    // A missing key is the expected demo path; a real failure is worth a log.
    if ((err as Error).message !== "not configured") {
      console.error("[aunty] falling back to canned reply:", (err as Error).message);
    }
    return mockReply(question);
  }
}

// ---------- Access and storage ----------

/** The group must be one the caller is an active member of, with an Aunty switched on. */
export async function requireAuntyGroup(actor: Actor, groupId: string) {
  const membership = actor.user.memberships.find((m) => m.groupId === groupId);
  if (!membership) throw forbidden("Join this group first");

  const setting = await db.auntySetting.findUnique({ where: { groupId } });
  if (!setting?.enabled) throw forbidden("The Elders haven't switched on an Aunty for this group");
  return { membership, setting };
}

/** One thread per person per group, created on first yarn. */
export async function getOrCreateThread(actor: Actor, groupId: string, communityId: string | null) {
  const existing = await db.auntyThread.findUnique({
    where: { groupId_userId: { groupId, userId: actor.user.id } },
  });
  if (existing) return existing;
  return db.auntyThread.create({
    data: { groupId, userId: actor.user.id, communityId },
  });
}

/**
 * Loads a thread's messages. Takes the actor so the ownership check sits next
 * to the read it protects — there is no "read someone else's thread" path.
 */
export async function loadMessages(actor: Actor, threadId: string) {
  const thread = await db.auntyThread.findUnique({ where: { id: threadId } });
  if (!thread || thread.userId !== actor.user.id) throw forbidden("Not your yarn");
  return db.auntyMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });
}

export function serializeMessage(m: {
  id: string;
  author: string;
  body: string;
  handoff: string | null;
  mocked: boolean;
  createdAt: Date;
}) {
  return {
    id: m.id,
    author: m.author,
    body: m.body,
    handoff: m.handoff,
    mocked: m.mocked,
    createdAt: m.createdAt,
  };
}
