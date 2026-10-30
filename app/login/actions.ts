"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, normalisePhone } from "@/lib/auth";

export type LoginState = { step: "phone" | "code"; phoneNumber?: string; error?: string };

export async function loginAction(prev: LoginState, form: FormData): Promise<LoginState> {
  const phoneNumber = normalisePhone(String(form.get("phoneNumber") ?? prev.phoneNumber ?? ""));
  if (!/^\+\d{8,15}$/.test(phoneNumber)) return { step: "phone", error: "Enter a mobile number, e.g. 0400 000 001" };

  if (prev.step === "phone" || form.get("resend")) {
    await auth.api.sendPhoneNumberOTP({ body: { phoneNumber } });
    return { step: "code", phoneNumber };
  }
  const code = String(form.get("code") ?? "").trim();
  try {
    // nextCookies() sets the session cookie on this server action's response.
    await auth.api.verifyPhoneNumber({ body: { phoneNumber, code }, headers: await headers() });
  } catch {
    return { step: "code", phoneNumber, error: "That code didn't work. Check it and try again." };
  }
  redirect("/");
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
