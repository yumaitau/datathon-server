import { getActor, route } from "@/lib/api";
import { languageProgress, selectableLanguages } from "@/lib/i18n";

/** Languages the app can offer: English, every published community language, and drafts the caller is writing. */
export const GET = route(async () => {
  const languages = await selectableLanguages(await getActor());
  const progress = await languageProgress(languages.map((l) => l.id));
  return [
    { code: "en", name: "English", endonym: "English", status: "published", approved: null, total: null, updatedAt: null },
    ...languages.map((l) => ({
      code: l.code,
      name: l.name,
      endonym: l.endonym,
      status: l.status,
      approved: progress.get(l.id)!.approved,
      total: progress.get(l.id)!.total,
      updatedAt: l.updatedAt,
    })),
  ];
});
