import { type IdParams, requireActor, route } from "@/lib/api";
import { hideComment } from "@/lib/governance";

export const POST = route(async (_req, { params }: IdParams) => {
  const actor = await requireActor();
  const c = await hideComment(actor, (await params).id);
  return { id: c.id, status: c.status };
});
