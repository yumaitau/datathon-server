import { getTranslations } from "next-intl/server";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const t = await getTranslations("login");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-accent">MyMob</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-ink-muted">{t("intro")}</p>
      </div>
      <LoginForm />
      <p className="text-xs text-ink-faint">{t("demoNote")}</p>
    </main>
  );
}
