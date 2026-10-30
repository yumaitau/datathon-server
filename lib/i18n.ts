import { TYPE, parse, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import type { Language } from "@/generated/prisma/client";
import type { Actor } from "@/lib/api";
import { db } from "@/lib/db";
import appEn from "@/messages/app.en.json";
import en from "@/messages/en.json";

// Community languages. English is the source catalog: messages/en.json for the
// web (ICU messages) and messages/app.en.json for the iOS app (printf strings,
// synced by scripts/sync-ios-strings.mjs). Each community-owned Language
// overlays approved translations, so anything untranslated falls back to English.

/** iOS strings are stored under this prefix plus their Xcode source key. */
export const APP_PREFIX = "app:";
export type Platform = "web" | "ios";

type Tree = { [key: string]: string | Tree };

export type CatalogEntry = { key: string; namespace: string; source: string; args: string[]; format: "icu" | "printf" };

function flatten(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : flatten(v, `${prefix}${k}.`),
  );
}

/** ICU argument names a message uses, including inside plural/select branches. */
export function messageArgs(message: string): string[] {
  const names = new Set<string>();
  const walk = (els: MessageFormatElement[]) => {
    for (const el of els) {
      if (el.type !== TYPE.literal && el.type !== TYPE.pound && "value" in el) names.add(String(el.value));
      if (el.type === TYPE.plural || el.type === TYPE.select) {
        for (const opt of Object.values(el.options)) walk(opt.value);
      }
      if (el.type === TYPE.tag) walk(el.children);
    }
  };
  walk(parse(message, { ignoreTag: true }));
  return [...names].sort();
}

/** printf placeholders by type (%@, %lld…); position markers like %1$@ are ignored so translators can reorder. */
export function printfArgs(message: string): string[] {
  return [...message.matchAll(/%(?:\d+\$)?(lld|ld|d|@|f|s|u)/g)].map((m) => `%${m[1]}`).sort();
}

let cached: CatalogEntry[] | undefined;

/** Every translatable string: web first, then the iOS app. */
export function catalog(): CatalogEntry[] {
  cached ??= [
    ...flatten(en as Tree).map(([key, source]) => ({
      key,
      namespace: key.split(".")[0],
      source,
      args: messageArgs(source),
      format: "icu" as const,
    })),
    ...Object.entries(appEn as Record<string, string>).map(([key, source]) => ({
      key: `${APP_PREFIX}${key}`,
      namespace: "app",
      source,
      args: printfArgs(source),
      format: "printf" as const,
    })),
  ];
  return cached;
}

export const catalogKeys = () => new Set(catalog().map((e) => e.key));

/**
 * A translation must be valid ICU and use exactly the source's arguments, so a
 * translated "{count} members" can't drop the number or invent a new one.
 */
export function validateTranslation(key: string, value: string): string | null {
  const entry = catalog().find((e) => e.key === key);
  if (!entry) return "Unknown string";
  if (!value.trim()) return "Translation is empty";
  if (entry.format === "printf") {
    const args = printfArgs(value);
    return args.join() === entry.args.join() ? null : `Keep the placeholders ${entry.args.join(" ")} from the English`;
  }
  let args: string[];
  try {
    args = messageArgs(value);
  } catch {
    return "Check the curly brackets: the text can't be read as a message";
  }
  const missing = entry.args.filter((a) => !args.includes(a));
  const extra = args.filter((a) => !entry.args.includes(a));
  if (missing.length) return `Keep ${missing.map((a) => `{${a}}`).join(", ")} from the English`;
  if (extra.length) return `${extra.map((a) => `{${a}}`).join(", ")} isn't in the English`;
  return null;
}

/** BCP 47 language tag, e.g. an ISO 639-3 code like "abc" or "abc-AU". */
export function normaliseLanguageCode(input: string): string | null {
  const code = input.trim();
  if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(code) || code.toLowerCase() === "en") return null;
  try {
    return Intl.getCanonicalLocales(code)[0] ?? null;
  } catch {
    return null;
  }
}

// ---------- Permissions ----------

/** Elders of the owning community can approve and publish. */
export function canApproveLanguage(actor: Actor, language: Pick<Language, "communityId">) {
  return actor.elderGroupIds.has(language.communityId);
}

/** Elders and the language custodians they appoint can draft translations. */
export function canEditLanguage(actor: Actor, language: Pick<Language, "communityId">) {
  return (
    canApproveLanguage(actor, language) ||
    actor.user.memberships.some((m) => m.groupId === language.communityId && m.canTranslate)
  );
}

/** Languages the actor may choose: all published ones plus drafts they help write. */
export async function selectableLanguages(actor: Actor | null) {
  const languages = await db.language.findMany({ orderBy: { name: "asc" } });
  return languages.filter((l) => l.status === "published" || (actor && canEditLanguage(actor, l)));
}

// ---------- Loading ----------

function setPath(tree: Tree, key: string, value: string) {
  const parts = key.split(".");
  let node = tree;
  for (const p of parts.slice(0, -1)) node = node[p] as Tree;
  node[parts.at(-1)!] = value;
}

/**
 * Approved translations for one platform. Web strings are keyed by message key;
 * iOS strings by their Xcode source key (the prefix is stripped).
 */
export async function approvedStrings(languageId: string, platform: Platform = "web") {
  const keys = catalogKeys();
  const rows = await db.translation.findMany({
    where: { languageId, status: "approved", key: platform === "ios" ? { startsWith: APP_PREFIX } : { not: { startsWith: APP_PREFIX } } },
  });
  return Object.fromEntries(
    rows.filter((r) => keys.has(r.key)).map((r) => [platform === "ios" ? r.key.slice(APP_PREFIX.length) : r.key, r.value]),
  );
}

/** English messages with the language's approved strings laid over them. */
export async function messagesFor(languageId: string) {
  const tree = structuredClone(en) as Tree;
  for (const [key, value] of Object.entries(await approvedStrings(languageId, "web"))) setPath(tree, key, value);
  return tree;
}

export async function languageProgress(languageIds: string[]) {
  const rows = languageIds.length
    ? await db.translation.groupBy({ by: ["languageId", "status"], where: { languageId: { in: languageIds } }, _count: true })
    : [];
  const total = catalog().length;
  return new Map(
    languageIds.map((id) => {
      const approved = rows.find((r) => r.languageId === id && r.status === "approved")?._count ?? 0;
      const draft = rows.find((r) => r.languageId === id && r.status === "draft")?._count ?? 0;
      return [id, { total, approved, draft }];
    }),
  );
}
