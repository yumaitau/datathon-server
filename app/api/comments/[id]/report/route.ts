import { z } from "zod";
import { type IdParams, notFound, readJson, requireActor, route } from "@/lib/api";
import { loadVisibleEvent, loadVisiblePost } from "@/lib/content";

const input = z.object({ reason: z.string().trim().min(1).max(500) });

/** Puts a comment in the Elder's moderation queue. */
export const POST = route(async (req, { params }: IdParams) => {
  const actor = await requireActor();
  const { reason } = input.parse(await readJson(req));
  const comment = await actor.db.comment.findUnique({ where: { id: (await params).id } });
  if (!comment) throw notFound("Comment not found");
  if (comment.postId) await loadVisiblePost(actor, comment.postId);
  else if (comment.eventId) await loadVisibleEvent(actor, comment.eventId);
  await actor.db.report.create({
    data: { communityId: comment.communityId, commentId: comment.id, reporterId: actor.user.id, reason },
  });
  return { ok: true };
});
