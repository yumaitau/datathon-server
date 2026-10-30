import { z } from "zod";
import { type Actor, HttpError, audit, forbidden, notFound, requireElder } from "@/lib/api";
import { db } from "@/lib/db";
import { canApproveLanguage, canEditLanguage, catalog, catalogKeys, normaliseLanguageCode, validateTranslation } from "@/lib/i18n";

// Community language management. The community owns its language: Elders
// create, approve and publish; custodians they appoint draft translations.

export const createLanguageInput = z.object({
  communityId: z.string(),
  code: z.string().trim().min(2).max(35),
  name: z.string().trim().min(1).max(80),
  endonym: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export async function createLanguage(actor: Actor, input: z.infer<typeof createLanguageInput>) {
  await requireElder(actor, input.communityId);
  const code = normaliseLanguageCode(input.code);
  if (!code) throw new HttpError(400, "Use a language code such as an ISO 639-3 code (3 letters). qaa–qtz are for local use.");
  if (await db.language.findUnique({ where: { code } })) throw new HttpError(409, "A language with that code already exists");
  const language = await db.language.create({
    data: { ...input, code, createdById: actor.user.id },
  });
  await audit(actor.user.id, "language.create", "Language", language.id, code);
  return language;
}

export async function loadEditableLanguage(actor: Actor, languageId: string) {
  const language = await db.language.findUnique({ where: { id: languageId } });
  if (!language || !canEditLanguage(actor, language)) throw notFound("Language not found");
  return language;
}

/**
 * Saves one string. Custodians' edits are drafts; an Elder may approve as they
 * save. Editing an approved string returns it to draft unless an Elder approves
 * again, so nothing changes in the live app without Elder sign-off.
 */
export async function saveTranslation(actor: Actor, languageId: string, key: string, value: string, approve = false) {
  const language = await loadEditableLanguage(actor, languageId);
  if (approve && !canApproveLanguage(actor, language)) throw forbidden("Only Elders can approve");
  if (!value.trim()) {
    await db.translation.deleteMany({ where: { languageId, key } });
    return null;
  }
  const error = validateTranslation(key, value);
  if (error) throw new HttpError(400, error);
  const status = approve ? ("approved" as const) : ("draft" as const);
  const saved = await db.translation.upsert({
    where: { languageId_key: { languageId, key } },
    create: { languageId, key, value, status, updatedById: actor.user.id, approvedById: approve ? actor.user.id : null },
    update: { value, status, updatedById: actor.user.id, approvedById: approve ? actor.user.id : null },
  });
  if (approve) await audit(actor.user.id, "translation.approve", "Language", languageId, key);
  return saved;
}

export async function approveDrafts(actor: Actor, languageId: string, keys?: string[]) {
  const language = await loadEditableLanguage(actor, languageId);
  if (!canApproveLanguage(actor, language)) throw forbidden("Only Elders can approve");
  const result = await db.translation.updateMany({
    where: { languageId, status: "draft", ...(keys ? { key: { in: keys } } : {}) },
    data: { status: "approved", approvedById: actor.user.id },
  });
  await audit(actor.user.id, "translation.approve", "Language", languageId, `${result.count} strings`);
  return result.count;
}

export async function setLanguageStatus(actor: Actor, languageId: string, status: "draft" | "published") {
  const language = await loadEditableLanguage(actor, languageId);
  if (!canApproveLanguage(actor, language)) throw forbidden("Only Elders can publish");
  const updated = await db.language.update({ where: { id: languageId }, data: { status } });
  await audit(actor.user.id, status === "published" ? "language.publish" : "language.unpublish", "Language", languageId);
  return updated;
}

export async function setCustodian(actor: Actor, membershipId: string, canTranslate: boolean) {
  const m = await db.membership.findUnique({ where: { id: membershipId } });
  if (!m || m.status !== "active") throw notFound("Member not found");
  await requireElder(actor, m.groupId);
  await db.membership.update({ where: { id: m.id }, data: { canTranslate } });
  await audit(actor.user.id, canTranslate ? "language.custodian.add" : "language.custodian.remove", "Membership", m.id);
}

/** Portable file for working with a language centre offline. */
export async function exportLanguage(languageId: string) {
  const language = await db.language.findUniqueOrThrow({ where: { id: languageId } });
  const rows = new Map((await db.translation.findMany({ where: { languageId } })).map((r) => [r.key, r]));
  return {
    format: "mymob-language/1",
    code: language.code,
    name: language.name,
    endonym: language.endonym,
    exportedAt: new Date(),
    strings: Object.fromEntries(
      catalog().map((e) => [e.key, { english: e.source, translation: rows.get(e.key)?.value ?? "", status: rows.get(e.key)?.status ?? "missing" }]),
    ),
  };
}

const importFile = z.object({
  strings: z.record(z.string(), z.union([z.string(), z.object({ translation: z.string() }).passthrough()])),
});

/**
 * Imports an export file (or a plain `{ key: text }` map). Everything comes in
 * as drafts for Elder review; invalid strings are reported, not saved.
 */
export async function importLanguage(actor: Actor, languageId: string, raw: unknown) {
  await loadEditableLanguage(actor, languageId);
  const parsed = importFile.safeParse(raw);
  const strings = parsed.success
    ? parsed.data.strings
    : z.record(z.string(), z.string()).safeParse(raw).data;
  if (!strings) throw new HttpError(400, "That file isn't a MyMob language export");
  const keys = catalogKeys();
  let saved = 0;
  const problems: string[] = [];
  for (const [key, entry] of Object.entries(strings)) {
    const value = typeof entry === "string" ? entry : entry.translation;
    if (!value.trim()) continue;
    if (!keys.has(key)) {
      problems.push(`${key}: not a MyMob string`);
      continue;
    }
    const error = validateTranslation(key, value);
    if (error) {
      problems.push(`${key}: ${error}`);
      continue;
    }
    await db.translation.upsert({
      where: { languageId_key: { languageId, key } },
      create: { languageId, key, value, updatedById: actor.user.id },
      update: { value, status: "draft", updatedById: actor.user.id, approvedById: null },
    });
    saved++;
  }
  await audit(actor.user.id, "language.import", "Language", languageId, `${saved} saved, ${problems.length} skipped`);
  return { saved, problems };
}
