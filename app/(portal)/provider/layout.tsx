import { Suspense } from "react";
import { SectionFallback } from "@/components/section-fallback";
import { getTranslations } from "next-intl/server";
import { NavLink } from "@/components/nav-link";
import { db } from "@/lib/db";
import { requireWebActor } from "@/lib/web";

export default async function ProviderLayout({ children }: LayoutProps<"/provider">) {
  const actor = await requireWebActor("provider");
  const t = await getTranslations("provider");
  const provider = await db.provider.findUniqueOrThrow({ where: { id: actor.providerIds[0] } });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-2xl font-semibold tracking-tight">{provider.name}</h1>
          <span className="text-sm text-ink-muted">{t("subtitle")}</span>
        </div>
        <nav aria-label={t("sections")} className="flex flex-wrap gap-1">
          <NavLink href="/provider" exact>{t("patients")}</NavLink>
          <NavLink href="/provider/appointments">{t("appointments")}</NavLink>
          <NavLink href="/provider/groups">{t("groups")}</NavLink>
          <NavLink href="/provider/insights">{t("insights")}</NavLink>
        </nav>
      </div>
      <Suspense fallback={<SectionFallback />}>{children}</Suspense>
    </div>
  );
}
