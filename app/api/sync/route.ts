import { readJson, requireActor, route } from "@/lib/api";
import { compactJson, fullSync, syncInput } from "@/lib/sync";

export const POST = route(async (req) => {
  const actor = await requireActor();
  return compactJson(req, await fullSync(actor, syncInput.parse(await readJson(req))));
});
