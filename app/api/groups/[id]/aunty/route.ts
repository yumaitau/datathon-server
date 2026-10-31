import { z } from "zod";
import { type IdParams, readJson, requireActor, route } from "@/lib/api";
import {
  askAunty,
  getOrCreateThread,
  loadMessages,
  requireAuntyGroup,
  serializeMessage,
} from "@/lib/aunty";
import { db } from "@/lib/db";

const input = z.object({
  body: z.string().trim().min(1).max(2000),
  clientMutationId: z.string().min(8).max(64).optional(),
});

/** The caller's own yarn in this group. Never anyone else's. */
export const GET = route(async (_req, { params }: IdParams) => {
  const actor = await requireActor();
  const groupId = (await params).id;
  const { setting } = await requireAuntyGroup(actor, groupId);

  const thread = await db.auntyThread.findUnique({
    where: { groupId_userId: { groupId, userId: actor.user.id } },
  });
  const messages = thread ? await loadMessages(actor, thread.id) : [];
  return {
    enabled: setting.enabled,
    guidance: setting.guidance,
    messages: messages.map(serializeMessage),
  };
});

export const POST = route(async (req, { params }: IdParams) => {
  const actor = await requireActor();
  const groupId = (await params).id;
  const { membership, setting } = await requireAuntyGroup(actor, groupId);
  const { body, clientMutationId } = input.parse(await readJson(req));

  // Replaying a queued offline send must not ask the Aunty twice.
  if (clientMutationId) {
    const seen = await db.auntyMessage.findUnique({ where: { clientMutationId } });
    if (seen) {
      const after = await db.auntyMessage.findMany({
        where: { threadId: seen.threadId, createdAt: { gte: seen.createdAt } },
        orderBy: { createdAt: "asc" },
      });
      return { messages: after.map(serializeMessage) };
    }
  }

  const communityId = membership.group.communityId;
  const thread = await getOrCreateThread(actor, groupId, communityId);
  const history = await db.auntyMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
    select: { author: true, body: true },
  });

  const mine = await db.auntyMessage.create({
    data: { threadId: thread.id, communityId, author: "member", body, clientMutationId },
  });

  const reply = await askAunty(body, history, setting.guidance, actor.user.name);
  const hers = await db.auntyMessage.create({
    data: {
      threadId: thread.id,
      communityId,
      author: "aunty",
      body: reply.body,
      handoff: reply.handoff,
      mocked: reply.mocked,
    },
  });

  await db.auntyThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
  return { messages: [mine, hers].map(serializeMessage) };
});

/** Clearing the yarn is the person's own call, and it really deletes. */
export const DELETE = route(async (_req, { params }: IdParams) => {
  const actor = await requireActor();
  const groupId = (await params).id;
  await requireAuntyGroup(actor, groupId);
  await db.auntyThread.deleteMany({ where: { groupId, userId: actor.user.id } });
  return { ok: true };
});
