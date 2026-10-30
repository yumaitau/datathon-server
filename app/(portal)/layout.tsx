import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import { LanguagePicker } from "@/components/language-picker";
import { NavLink } from "@/components/nav-link";
import { selectableLanguages } from "@/lib/i18n";
import { requireWebActor } from "@/lib/web";
import { signOutAction } from "../login/actions";

async function TopBar() {
  const actor = await requireWebActor();
  const t = await getTranslations("nav");
  const locale = await getLocale();
  const languages = await selectableLanguages(actor);
  const custodian = actor.elderGroupIds.size > 0 || actor.user.memberships.some((m) => m.canTranslate);
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link href="/" className="text-base font-semibold text-accent">MyMob</Link>
        <nav aria-label={t("label")} className="flex flex-wrap gap-1">
          {actor.elderGroupIds.size > 0 && <NavLink href="/elder">{t("elder")}</NavLink>}
          {actor.providerIds.length > 0 && <NavLink href="/provider">{t("provider")}</NavLink>}
          {custodian && <NavLink href="/languages">{t("languages")}</NavLink>}
          {actor.isAdmin && <NavLink href="/admin">{t("admin")}</NavLink>}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <LanguagePicker
            current={locale}
            label={t("language")}
            languages={[
              { code: "en", label: "English" },
              ...languages.map((l) => ({
                code: l.code,
                label: `${l.endonym ?? l.name}${l.status === "draft" ? ` (${t("draft")})` : ""}`,
              })),
            ]}
          />
          <span className="text-ink-muted">{actor.user.name}</span>
          <form action={signOutAction}>
            <button className="rounded-md px-2 py-1 text-ink-muted hover:bg-sunken">{t("signOut")}</button>
          </form>
        </div>
      </div>
    </header>
  );
}

// Every portal page reads the session, which can't be part of a static shell.
// Let navigations into the portals block on the server instead of validating
// each authenticated route for instant navigation.
export const instant = false;

export default function PortalLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Suspense fallback={<div className="h-14 border-b border-line bg-surface" />}>
        <TopBar />
      </Suspense>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>{children}</Suspense>
      </main>
    </>
  );
}
