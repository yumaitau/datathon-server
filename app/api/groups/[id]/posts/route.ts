import { z } from "zod";
import { type IdParams, readJson, requireActor, route } from "@/lib/api";
import { postInclude, serializePosts } from "@/lib/content";
import { createPost, createPostInput } from "@/lib/mutations";

const input = createPostInput.omit({ groupId: true }).extend({ clientMutationId: z.string().min(8).max(64).optional() });

export const POST = route(async (req, { params }: IdParams) => {
  const actor = await requireActor();
  const { clientMutationId, ...body } = input.parse(await readJson(req));
  const post = await createPost(actor, { ...body, groupId: (await params).id }, clientMutationId);
  const full = await actor.db.post.findUniqueOrThrow({ where: { id: post.id }, include: postInclude });
  return (await serializePosts(actor, [full]))[0];
});
