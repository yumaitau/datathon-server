"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import { type LoginState, loginAction } from "./actions";

export function LoginForm() {
  const t = useTranslations("login");
  const [state, action] = useActionState<LoginState, FormData>(loginAction, { step: "phone" });
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.step === "phone" ? (
        <Field label={t("phone")} hint={t("phoneHint")}>
          <input name="phoneNumber" type="tel" autoComplete="tel" required autoFocus className={inputClass} placeholder="0400 000 001" />
        </Field>
      ) : (
        <>
          <p className="text-sm text-ink-muted">{t("codeSent", { phone: state.phoneNumber ?? "" })}</p>
          <Field label={t("code")}>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus maxLength={8} className={`${inputClass} tracking-[0.3em]`} />
          </Field>
        </>
      )}
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <SubmitButton pendingLabel={t("working")}>{state.step === "phone" ? t("sendCode") : t("signIn")}</SubmitButton>
      {state.step === "code" && (
        <button name="resend" value="1" formNoValidate className="text-sm text-ink-muted underline-offset-4 hover:underline">
          {t("resend")}
        </button>
      )}
    </form>
  );
}
