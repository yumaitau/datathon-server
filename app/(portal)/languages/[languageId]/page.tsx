import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, PageHeader, buttonClass } from "@/components/ui";
import { db } from "@/lib/db";
import { canApproveLanguage, canEditLanguage, catalog } from "@/lib/i18n";
import { requireWebActor } from "@/lib/web";
import { setLocaleAction } from "../../../locale-actions";
import { approveAllAction, importAction, publishAction } from "../actions";
import { TranslationRow } from "../translation-row";

const FILTERS = ["missing", "draft", "approved", "all"] as const;
type Filter = (typeof FILTERS)[number];

export default async function LanguageEditor({ params, searchParams }: PageProps<"/languages/[languageId]">) {
  const { languageId } = await params;
  const query = await searchParams;
  const actor = await requireWebActor();
  const t = await getTranslations("languages");
  const language = await db.language.findUnique({ where: { id: languageId }, include: { community: true } });
  if (!language || !canEditLanguage(actor, language)) notFound();
  const elder = canApproveLanguage(actor, language);

  const rows = new Map((await db.translation.findMany({ where: { languageId } })).map((r) => [r.key, r]));
  const entries = catalog().map((e) => ({ ...e, status: (rows.get(e.key)?.status ?? "missing") as "approved" | "draft" | "missing", value: rows.get(e.key)?.value ?? "" }));
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === "all" ? entries.length : entries.filter((e) => e.status === f).length]));
  const filter: Filter = FILTERS.includes(query.show as Filter) ? (query.show as Filter) : counts.missing ? "missing" : "all";
  const namespaces = [...new Set(entries.map((e) => e.namespace))];
  const ns = typeof query.section === "string" && namespaces.includes(query.section) ? query.section : undefined;
  const shown = entries.filter((e) => (filter === "all" || e.status === filter) && (!ns || e.namespace === ns));
  const href = (show: Filter, section = ns) => `/languages/${languageId}?show=${show}${section ? `&section=${section}` : ""}`;

  return (
    <>
      <PageHeader
        title={language.endonym ?? language.name}
        description={
          <>
            {language.endonym && <>{language.name} · </>}
            <span className="font-mono">{language.code}</span> · {t("ownedBy", { community: language.community.name })}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={language.status === "published" ? "accent" : "warn"}>{t(`language_${language.status}`)}</Badge>
            <form action={setLocaleAction}>
              <input type="hidden" name="locale" value={language.code} />
              <SubmitButton size="sm" variant="secondary">{t("preview")}</SubmitButton>
            </form>
            <a className={buttonClass("secondary", "sm")} href={`/api/languages/${language.id}/export`}>{t("export")}</a>
            {elder && (
              <form action={publishAction}>
                <input type="hidden" name="languageId" value={language.id} />
                <SubmitButton size="sm" variant={language.status === "published" ? "secondary" : "primary"} name="status" value={language.status === "published" ? "draft" : "published"}>
                  {language.status === "published" ? t("unpublish") : t("publish")}
                </SubmitButton>
              </form>
            )}
          </div>
        }
      />
      <p className="max-w-3xl text-sm text-ink-muted">{elder ? t("elderNote") : t("custodianNote")}</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label={t("filter")} className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <Link key={f} href={href(f)} aria-current={f === filter ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${f === filter ? "bg-accent-soft text-accent-strong" : "text-ink-muted hover:bg-sunken"}`}>
                  {t(`filter_${f}`, { count: counts[f] })}
                </Link>
              ))}
            </nav>
            {elder && counts.draft > 0 && (
              <form action={approveAllAction}>
                <input type="hidden" name="languageId" value={language.id} />
                <SubmitButton size="sm" variant="secondary">{t("approveAll", { count: counts.draft })}</SubmitButton>
              </form>
            )}
          </div>
          <nav aria-label={t("sections")} className="flex flex-wrap gap-1 text-xs">
            <Link href={href(filter, undefined)} className={`rounded px-2 py-1 ${!ns ? "bg-sunken text-ink" : "text-ink-muted hover:bg-sunken"}`}>{t("allSections")}</Link>
            {namespaces.map((n) => (
              <Link key={n} href={href(filter, n)} className={`rounded px-2 py-1 ${ns === n ? "bg-sunken text-ink" : "text-ink-muted hover:bg-sunken"}`}>{n}</Link>
            ))}
          </nav>
          {shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">{t("nothingHere")}</p>
          ) : (
            <ul lang={language.code} className="flex flex-col divide-y divide-line">
              {shown.map((e) => (
                <TranslationRow key={`${e.key}:${e.status}:${e.value}`} rowId={e.key.startsWith("app:") ? `app-${entries.indexOf(e)}` : e.key} languageId={language.id} entry={e} value={e.value} status={e.status} canApprove={elder} />
              ))}
            </ul>
          )}
        </Card>
        <div className="flex flex-col gap-6">
          <Card title={t("importTitle")} description={t("importHint")}>
            <ActionForm action={importAction} className="flex flex-col gap-3">
              <input type="hidden" name="languageId" value={language.id} />
              <input type="file" name="file" accept="application/json,.json" required className="text-sm" aria-label={t("importTitle")} />
              <SubmitButton variant="secondary">{t("import")}</SubmitButton>
            </ActionForm>
          </Card>
          {language.notes && <Card title={t("notes")}><p className="text-sm">{language.notes}</p></Card>}
        </div>
      </div>
    </>
  );
}
