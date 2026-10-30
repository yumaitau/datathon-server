import { z } from "zod";
import { type IdParams, readJson, requireActor, route } from "@/lib/api";
import { setCustodian } from "@/lib/languages";

const input = z.object({ canTranslate: z.boolean() });

/** Elder only: appoint or stand down a language custodian. */
export const POST = route(async (req, { params }: IdParams) => {
  const actor = await requireActor();
  const { canTranslate } = input.parse(await readJson(req));
  const id = (await params).id;
  await setCustodian(actor, id, canTranslate);
  return { id, canTranslate };
});
