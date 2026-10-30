"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  approveDrafts,
  createLanguage,
  createLanguageInput,
  importLanguage,
  saveTranslation,
  setCustodian,
  setLanguageStatus,
} from "@/lib/languages";
import { formResult, requireWebActor } from "@/lib/web";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

export async function createLanguageAction(_: unknown, form: FormData) {
  let id: string | undefined;
  const result = await formResult(async () => {
    const actor = await requireWebActor();
    const language = await createLanguage(
      actor,
      createLanguageInput.parse({
        communityId: text(form, "communityId"),
        code: text(form, "code"),
        name: text(form, "name"),
        endonym: text(form, "endonym"),
        notes: text(form, "notes"),
      }),
    );
    id = language.id;
  });
  if (id) redirect(`/languages/${id}`);
  return result;
}

export type RowState = { error?: string; ok?: boolean; status?: string };

export async function saveTranslationAction(_: RowState, form: FormData): Promise<RowState> {
  const approve = form.get("intent") === "approve";
  let status: string | undefined;
  const result = await formResult(async () => {
    const actor = await requireWebActor();
    const saved = await saveTranslation(actor, String(form.get("languageId")), String(form.get("key")), String(form.get("value") ?? ""), approve);
    status = saved?.status ?? "missing";
  });
  revalidatePath("/languages", "layout");
  return { ...result, status };
}

export async function approveAllAction(form: FormData) {
  const actor = await requireWebActor();
  await approveDrafts(actor, String(form.get("languageId")));
  revalidatePath("/languages", "layout");
}

export async function publishAction(form: FormData) {
  const actor = await requireWebActor();
  const status = z.enum(["draft", "published"]).parse(form.get("status"));
  await setLanguageStatus(actor, String(form.get("languageId")), status);
  revalidatePath("/", "layout");
}

export async function importAction(_: unknown, form: FormData): Promise<{ error?: string; ok?: boolean; message?: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to import" };
  if (file.size > 2_000_000) return { error: "That file is too large" };
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { error: "That file isn't valid JSON" };
  }
  let summary = "";
  const result = await formResult(async () => {
    const actor = await requireWebActor();
    const { saved, problems } = await importLanguage(actor, String(form.get("languageId")), data);
    summary = problems.length ? `${saved} saved as drafts. Skipped: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? "…" : ""}` : `${saved} saved as drafts.`;
  });
  revalidatePath("/languages", "layout");
  return result.error ? result : { ok: true, message: summary };
}

export async function custodianAction(form: FormData) {
  const actor = await requireWebActor();
  await setCustodian(actor, String(form.get("membershipId")), form.get("canTranslate") === "true");
  revalidatePath("/", "layout");
}
