import { Suspense } from "react";
import { SectionFallback } from "@/components/section-fallback";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { NavLink } from "@/components/nav-link";
import { isElderOf } from "@/lib/api";
import { db } from "@/lib/db";
import { requireWebActor } from "@/lib/web";

export default async function ElderGroupLayout({ children, params }: LayoutProps<"/elder/[groupId]">) {
  const { groupId } = await params;
  const actor = await requireWebActor("elder");
  if (!(await isElderOf(actor, groupId))) notFound();
  const t = await getTranslations("elder");
  const [group, mine] = await Promise.all([
    db.group.findUniqueOrThrow({ where: { id: groupId } }),
    db.group.findMany({ where: { id: { in: [...actor.elderGroupIds] } }, orderBy: { name: "asc" } }),
  ]);
  const base = `/elder/${groupId}`;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
          <span className="text-sm text-ink-muted">{t("subtitle")}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label={t("sections")} className="flex flex-wrap gap-1">
            <NavLink href={base} exact>{t("requests")}</NavLink>
            <NavLink href={`${base}/members`}>{t("members")}</NavLink>
            <NavLink href={`${base}/engagement`}>{t("engagement")}</NavLink>
            <NavLink href={`${base}/services`}>{t("services")}</NavLink>
          </nav>
          {mine.length > 1 && (
            <nav aria-label={t("switchGroup")} className="flex flex-wrap gap-1 text-sm">
              {mine.filter((g) => g.id !== groupId).map((g) => (
                <NavLink key={g.id} href={`/elder/${g.id}`}>{g.name}</NavLink>
              ))}
            </nav>
          )}
        </div>
      </div>
      <Suspense fallback={<SectionFallback />}>{children}</Suspense>
    </div>
  );
}
