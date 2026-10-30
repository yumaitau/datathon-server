import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { type Actor, HttpError, forbidden, isElderOf, notFound } from "@/lib/api";
import { loadVisibleEvent, loadVisiblePost, memberGroupIds } from "@/lib/content";
import { db } from "@/lib/db";
import { confirmAppointment } from "@/lib/health";

// Every write the iOS app can queue offline lives here, so the direct endpoints
// and POST /api/sync apply identical rules.

export const genderEnum = z.enum(["female", "male", "other"]);

export const createPostInput = z.object({
  groupId: z.string(),
  body: z.string().trim().min(1).max(4000),
  title: z.string().trim().max(140).optional().nullable(),
  kind: z.enum(["announcement", "general", "sorry_business"]).default("announcement"),
  urgent: z.boolean().optional(),
  restrictGender: genderEnum.optional().nullable(),
  minAge: z.number().int().min(0).max(120).optional().nullable(),
  deceasedWarning: z.boolean().optional(),
});

export async function createPost(actor: Actor, input: z.infer<typeof createPostInput>, clientMutationId?: string) {
  if (clientMutationId) {
    const existing = await actor.db.post.findUnique({ where: { clientMutationId } });
    if (existing) return existing;
  }
  const group = await db.group.findUnique({ where: { id: input.groupId } });
  if (!group?.communityId || !memberGroupIds(actor).includes(group.id)) throw notFound("Group not found");
  const elder = await isElderOf(actor, group.id);
  if (input.kind === "sorry_business" && !elder) throw forbidden("Only Elders post sorry business notices");
  const sorry = input.kind === "sorry_business";
  return actor.db.post.create({
    data: {
      communityId: group.communityId,
      groupId: group.id,
      authorId: actor.user.id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      urgent: elder ? !!input.urgent : false,
      restrictGender: input.restrictGender ?? null,
      minAge: input.minAge ?? null,
      deceasedWarning: elder ? !!input.deceasedWarning : false,
      // Sorry business defaults to comments off; Elders can allow condolences.
      commentsEnabled: !sorry,
      // Everyone's posts publish straight away; Elders moderate afterwards (remove, pin, lock).
      status: "published",
      clientMutationId,
    },
  });
}

export const createCommentInput = z
  .object({
    postId: z.string().optional(),
    eventId: z.string().optional(),
    parentCommentId: z.string().optional().nullable(),
    body: z.string().trim().min(1).max(2000),
  })
  .refine((v) => !!v.postId !== !!v.eventId, "Provide postId or eventId");

export async function createComment(
  actor: Actor,
  input: z.infer<typeof createCommentInput>,
  clientMutationId?: string,
) {
  if (clientMutationId) {
    const existing = await actor.db.comment.findUnique({ where: { clientMutationId } });
    if (existing) return existing;
  }
  const target = input.postId
    ? (await loadVisiblePost(actor, input.postId)).post
    : (await loadVisibleEvent(actor, input.eventId!)).event;
  if ("status" in target && target.status !== "published") throw forbidden("Post is not published");
  if (!target.commentsEnabled) throw forbidden("Comments are turned off");
  if (target.threadLocked) throw forbidden("This thread is locked");

  let parentCommentId: string | null = null;
  if (input.parentCommentId) {
    const parent = await actor.db.comment.findUnique({ where: { id: input.parentCommentId } });
    if (!parent || (parent.postId ?? parent.eventId) !== target.id) throw notFound("Comment not found");
    // Threads stay one level deep: a reply to a reply attaches to its top-level parent.
    parentCommentId = parent.parentCommentId ?? parent.id;
  }
  return actor.db.comment.create({
    data: {
      communityId: target.communityId,
      postId: input.postId ?? null,
      eventId: input.eventId ?? null,
      parentCommentId,
      authorId: actor.user.id,
      body: input.body,
      clientMutationId,
    },
  });
}

export const rsvpInput = z.object({
  eventId: z.string(),
  response: z.enum(["going", "maybe", "no"]),
  respondedAt: z.coerce.date().optional(),
});

export async function rsvp(actor: Actor, input: z.infer<typeof rsvpInput>, clientMutationId?: string) {
  const { event } = await loadVisibleEvent(actor, input.eventId);
  if (event.cancelledAt) throw forbidden("Event was cancelled");
  const respondedAt = input.respondedAt ?? new Date();
  const existing = await actor.db.rsvp.findUnique({
    where: { eventId_userId: { eventId: event.id, userId: actor.user.id } },
  });
  // Last write wins by client timestamp, so a late-arriving offline RSVP can't clobber a newer one.
  if (existing && existing.respondedAt > respondedAt) return existing;
  if (existing) {
    return actor.db.rsvp.update({
      where: { id: existing.id },
      data: { response: input.response, respondedAt, clientMutationId },
    });
  }
  return actor.db.rsvp.create({
    data: {
      communityId: event.communityId,
      eventId: event.id,
      userId: actor.user.id,
      response: input.response,
      respondedAt,
      clientMutationId,
    },
  });
}

export const reactionInput = z.object({
  targetType: z.enum(["post", "comment", "event"]),
  targetId: z.string(),
  kind: z.enum(["like", "heart", "thinking_of_you", "deadly", "aboriginal_flag"]),
  /** Explicit state for queued writes; omitted means toggle. */
  active: z.boolean().optional(),
});

export async function react(actor: Actor, input: z.infer<typeof reactionInput>) {
  let communityId: string | null;
  if (input.targetType === "post") communityId = (await loadVisiblePost(actor, input.targetId)).post.communityId;
  else if (input.targetType === "event")
    communityId = (await loadVisibleEvent(actor, input.targetId)).event.communityId;
  else {
    const comment = await actor.db.comment.findUnique({ where: { id: input.targetId } });
    if (!comment || comment.status !== "published") throw notFound("Comment not found");
    if (comment.postId) await loadVisiblePost(actor, comment.postId);
    else if (comment.eventId) await loadVisibleEvent(actor, comment.eventId);
    communityId = comment.communityId;
  }
  const key = {
    targetType: input.targetType,
    targetId: input.targetId,
    userId: actor.user.id,
    kind: input.kind,
  };
  const existing = await actor.db.reaction.findFirst({ where: key });
  const want = input.active ?? !existing;
  if (want && !existing) await actor.db.reaction.create({ data: { ...key, communityId } });
  if (!want && existing) await actor.db.reaction.delete({ where: { id: existing.id } });
  const rows = await db.reaction.groupBy({
    by: ["kind"],
    where: { targetType: input.targetType, targetId: input.targetId },
    _count: true,
  });
  const counts = { like: 0, heart: 0, thinking_of_you: 0, deadly: 0, aboriginal_flag: 0 };
  for (const r of rows) counts[r.kind] = r._count;
  return { active: want, counts };
}

// ---------- Sync queue ----------

export const mutationInput = z.object({
  clientMutationId: z.string().min(8).max(64),
  type: z.enum(["rsvp", "confirmAppointment", "createPost", "createComment", "reaction"]),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.coerce.date().optional(),
});

export type MutationResult = {
  clientMutationId: string;
  status: "applied" | "duplicate" | "rejected";
  entityId?: string;
  error?: string;
};

async function applyOne(actor: Actor, m: z.infer<typeof mutationInput>): Promise<string | undefined> {
  const id = m.clientMutationId;
  switch (m.type) {
    case "rsvp":
      return (await rsvp(actor, rsvpInput.parse({ respondedAt: m.createdAt, ...m.payload }), id)).id;
    case "confirmAppointment":
      return (await confirmAppointment(actor, z.string().parse(m.payload.appointmentId))).id;
    case "createPost":
      return (await createPost(actor, createPostInput.parse(m.payload), id)).id;
    case "createComment":
      return (await createComment(actor, createCommentInput.parse(m.payload), id)).id;
    case "reaction":
      await react(actor, reactionInput.parse(m.payload));
      return z.string().parse(m.payload.targetId);
  }
}

/**
 * Applies queued writes in order. Each clientMutationId is recorded with its
 * result, so a retry after a dropped (e.g. satellite) session never double-submits.
 */
export async function applyMutations(actor: Actor, raw: unknown[]): Promise<MutationResult[]> {
  const results: MutationResult[] = [];
  for (const item of raw) {
    const parsed = mutationInput.safeParse(item);
    if (!parsed.success) {
      const cmid = (item as { clientMutationId?: unknown })?.clientMutationId;
      results.push({
        clientMutationId: typeof cmid === "string" ? cmid : "",
        status: "rejected",
        error: "Invalid mutation",
      });
      continue;
    }
    const m = parsed.data;
    const prior = await db.clientMutation.findUnique({ where: { id: m.clientMutationId } });
    if (prior) {
      if (prior.userId !== actor.user.id) {
        results.push({ clientMutationId: m.clientMutationId, status: "rejected", error: "Conflict" });
      } else {
        results.push({ ...(prior.result as MutationResult), status: "duplicate" });
      }
      continue;
    }
    let result: MutationResult;
    try {
      const entityId = await applyOne(actor, m);
      result = { clientMutationId: m.clientMutationId, status: "applied", entityId };
    } catch (err) {
      const message =
        err instanceof HttpError ? err.message : err instanceof z.ZodError ? "Invalid payload" : "Failed";
      if (!(err instanceof HttpError) && !(err instanceof z.ZodError)) console.error(err);
      result = { clientMutationId: m.clientMutationId, status: "rejected", error: message };
    }
    try {
      await db.clientMutation.create({
        data: { id: m.clientMutationId, userId: actor.user.id, type: m.type, result },
      });
    } catch (err) {
      // A concurrent retry recorded it first; its result stands.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
    results.push(result);
  }
  return results;
}
