import { getLocale, getTranslations } from "next-intl/server";
import { LanguagePicker } from "@/components/language-picker";
import { selectableLanguages } from "@/lib/i18n";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const t = await getTranslations("login");
  const nav = await getTranslations("nav");
  const [locale, languages] = await Promise.all([getLocale(), selectableLanguages(null)]);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-accent">MyMob</p>
          {languages.length > 0 && (
            <LanguagePicker
              current={locale}
              label={nav("language")}
              languages={[{ code: "en", label: "English" }, ...languages.map((l) => ({ code: l.code, label: l.endonym ?? l.name }))]}
            />
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-ink-muted">{t("intro")}</p>
      </div>
      <LoginForm />
      <p className="text-xs text-ink-faint">{t("demoNote")}</p>
    </main>
  );
}
