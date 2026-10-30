import { z } from "zod";
import { type IdParams, readJson, requireActor, route } from "@/lib/api";
import { decideProviderAccess } from "@/lib/governance";

const input = z.object({ decision: z.enum(["approved", "rejected"]) });

export const POST = route(async (req, { params }: IdParams) => {
  const actor = await requireActor();
  const { decision } = input.parse(await readJson(req));
  const access = await decideProviderAccess(actor, (await params).id, decision);
  return { id: access.id, status: access.status };
});
