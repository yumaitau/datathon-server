import { redirect } from "next/navigation";
import { type Actor, getActor } from "@/lib/api";

/** Server-component guard for the web portals: redirects to sign-in when needed. */
export async function requireWebActor(need?: "elder" | "provider" | "admin"): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (need === "elder" && actor.elderGroupIds.size === 0) redirect("/");
  if (need === "provider" && actor.providerIds.length === 0) redirect("/");
  if (need === "admin" && !actor.isAdmin) redirect("/");
  return actor;
}

/** Runs a server action body and turns expected failures into a form message. */
export async function formResult(fn: () => Promise<unknown>): Promise<{ error?: string; ok?: boolean }> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    const e = err as { status?: number; message?: string; issues?: { message: string }[] };
    if (e.issues) return { error: e.issues.map((i) => i.message).join(", ") };
    if (e.status && e.status < 500) return { error: e.message };
    throw err;
  }
}
