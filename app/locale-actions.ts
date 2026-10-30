"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export async function toggleLocaleAction() {
  const jar = await cookies();
  jar.set("locale", jar.get("locale")?.value === "xx" ? "en" : "xx", { path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
}
