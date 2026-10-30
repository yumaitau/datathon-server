import { readJson, requireActor, route } from "@/lib/api";
import { react, reactionInput } from "@/lib/mutations";

export const POST = route(async (req) => {
  const actor = await requireActor();
  return react(actor, reactionInput.parse(await readJson(req)));
});
