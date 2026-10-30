import { readJson, requireActor, route } from "@/lib/api";
import { compactJson, liteSync, syncInput } from "@/lib/sync";

/** Satellite mode: one batched request, essentials only, gzip. */
export const POST = route(async (req) => {
  const actor = await requireActor();
  return compactJson(req, await liteSync(actor, syncInput.parse(await readJson(req))));
});
