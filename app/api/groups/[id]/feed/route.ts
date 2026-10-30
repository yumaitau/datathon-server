import { type IdParams, requireActor, route } from "@/lib/api";
import { groupFeed } from "@/lib/content";

export const GET = route(async (_req, { params }: IdParams) => {
  const actor = await requireActor();
  return groupFeed(actor, (await params).id);
});
