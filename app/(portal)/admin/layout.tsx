import { Suspense } from "react";
import { SectionFallback } from "@/components/section-fallback";
import { getTranslations } from "next-intl/server";
import { NavLink } from "@/components/nav-link";
import { requireWebActor } from "@/lib/web";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireWebActor("admin");
  const t = await getTranslations("admin");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 border-b border-line pb-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-ink-muted">{t("subtitle")}</p>
        </div>
        <nav aria-label={t("sections")} className="flex flex-wrap gap-1">
          <NavLink href="/admin" exact>{t("verification")}</NavLink>
          <NavLink href="/admin/outbox">{t("outbox")}</NavLink>
          <NavLink href="/admin/audit">{t("audit")}</NavLink>
        </nav>
      </div>
      <Suspense fallback={<SectionFallback />}>{children}</Suspense>
    </div>
  );
}
