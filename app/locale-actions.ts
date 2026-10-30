"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getActor } from "@/lib/api";
import { selectableLanguages } from "@/lib/i18n";

/** Stores the chosen language. Only English or a language the person may see is accepted. */
export async function setLocaleAction(form: FormData) {
  const code = String(form.get("locale") ?? "en");
  const allowed = code === "en" || (await selectableLanguages(await getActor())).some((l) => l.code === code);
  (await cookies()).set("locale", allowed ? code : "en", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
