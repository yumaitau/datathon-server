import { getActor, notFound, route } from "@/lib/api";
import { db } from "@/lib/db";
import { type Platform, approvedStrings, canEditLanguage } from "@/lib/i18n";

/**
 * Approved strings for one language as a flat `{ key: text }` map.
 * `?platform=ios` returns the app's strings keyed by their Xcode source key. Clients
 * overlay it on their English strings, so untranslated keys stay English. The
 * `version` lets the app skip re-downloading an unchanged language.
 */
export const GET = route(async (req, { params }: { params: Promise<{ code: string }> }) => {
  const language = await db.language.findUnique({ where: { code: (await params).code } });
  const actor = await getActor();
  if (!language || (language.status !== "published" && !(actor && canEditLanguage(actor, language)))) {
    throw notFound("Language not found");
  }
  const platform: Platform = new URL(req.url).searchParams.get("platform") === "ios" ? "ios" : "web";
  const latest = await db.translation.aggregate({ where: { languageId: language.id, status: "approved" }, _max: { updatedAt: true } });
  const version = `${platform}-${(latest._max.updatedAt ?? language.updatedAt).getTime()}`;
  const etag = `"${version}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
  return Response.json(
    { code: language.code, name: language.name, endonym: language.endonym, status: language.status, platform, version, strings: await approvedStrings(language.id, platform) },
    { headers: { etag, "cache-control": "private, max-age=300" } },
  );
});
