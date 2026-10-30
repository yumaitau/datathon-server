import { z } from "zod";
import { notFound, readJson, requireActor, route } from "@/lib/api";
import { postInclude, serializePosts } from "@/lib/content";
import { db } from "@/lib/db";
import { type PostAction, moderatePost } from "@/lib/governance";

const ACTIONS = new Set<PostAction>(["approve", "reject", "pin", "settings"]);
const input = z.object({
  pinned: z.boolean().optional(),
  commentsEnabled: z.boolean().optional(),
  threadLocked: z.boolean().optional(),
  deceasedWarning: z.boolean().optional(),
});

export const POST = route(async (req, { params }: { params: Promise<{ id: string; action: string }> }) => {
  const actor = await requireActor();
  const { id, action } = await params;
  if (!ACTIONS.has(action as PostAction)) throw notFound();
  await moderatePost(actor, id, action as PostAction, input.parse(await readJson(req)));
  const post = await db.post.findUniqueOrThrow({ where: { id }, include: postInclude });
  return (await serializePosts(actor, [post]))[0];
});
