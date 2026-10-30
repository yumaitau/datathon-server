import { type IdParams, requireActor, route } from "@/lib/api";
import { exportLanguage, loadEditableLanguage } from "@/lib/languages";

/** Download every string with its English source, for language centre work offline. */
export const GET = route(async (_req, { params }: IdParams) => {
  const actor = await requireActor();
  const language = await loadEditableLanguage(actor, (await params).id);
  const file = await exportLanguage(language.id);
  return new Response(JSON.stringify(file, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="mymob-${language.code}.json"` },
  });
});
