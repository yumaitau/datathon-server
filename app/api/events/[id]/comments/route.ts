import { z } from "zod";
import { type IdParams, readJson, requireActor, route } from "@/lib/api";
import { loadVisibleEvent, serializeComments } from "@/lib/content";
import { createComment } from "@/lib/mutations";

const input = z.object({
  body: z.string().trim().min(1).max(2000),
  parentCommentId: z.string().optional().nullable(),
  clientMutationId: z.string().min(8).max(64).optional(),
});

const authorSelect = { author: { select: { id: true, name: true } } } as const;

export const GET = route(async (_req, { params }: IdParams) => {
  const actor = await requireActor();
  const { event, elderOf } = await loadVisibleEvent(actor, (await params).id);
  const comments = await actor.db.comment.findMany({
    where: { eventId: event.id, status: { not: "removed" } },
    include: authorSelect,
    orderBy: { createdAt: "asc" },
  });
  return serializeComments(actor, comments, elderOf.has(event.groupId));
});

export const POST = route(async (req, { params }: IdParams) => {
  const actor = await requireActor();
  const { clientMutationId, ...body } = input.parse(await readJson(req));
  const comment = await createComment(actor, { ...body, eventId: (await params).id }, clientMutationId);
  const full = await actor.db.comment.findUniqueOrThrow({ where: { id: comment.id }, include: authorSelect });
  return (await serializeComments(actor, [full], false, true))[0];
});
