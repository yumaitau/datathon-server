import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, EmptyState, Field, PageHeader, inputClass } from "@/components/ui";
import { db } from "@/lib/db";
import { canEditLanguage, languageProgress } from "@/lib/i18n";
import { requireWebActor } from "@/lib/web";
import { createLanguageAction } from "./actions";

export default async function Languages() {
  const actor = await requireWebActor();
  const t = await getTranslations("languages");
  const all = await db.language.findMany({ include: { community: true }, orderBy: { name: "asc" } });
  const mine = all.filter((l) => canEditLanguage(actor, l));
  const progress = await languageProgress(mine.map((l) => l.id));
  const elderCommunities = await db.group.findMany({ where: { id: { in: [...actor.elderGroupIds] }, type: "community" }, orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card title={t("yourLanguages")}>
          {mine.length === 0 ? <EmptyState>{t("none")}</EmptyState> : (
            <ul className="flex flex-col divide-y divide-line">
              {mine.map((l) => {
                const p = progress.get(l.id)!;
                const pct = Math.round((100 * p.approved) / p.total);
                return (
                  <li key={l.id} className="flex flex-col gap-2 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/languages/${l.id}`} className="font-medium text-accent-strong underline-offset-4 hover:underline">
                        {l.endonym ?? l.name}
                      </Link>
                      {l.endonym && <span className="text-sm text-ink-muted">{l.name}</span>}
                      <span className="font-mono text-xs text-ink-faint">{l.code}</span>
                      <Badge tone={l.status === "published" ? "accent" : "warn"}>{t(`language_${l.status}`)}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("progressLabel")}>
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-ink-muted">{t("progress", { approved: p.approved, total: p.total, draft: p.draft })}</span>
                    </div>
                    <span className="text-xs text-ink-faint">{t("ownedBy", { community: l.community.name })}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        {elderCommunities.length > 0 && (
          <Card title={t("addLanguage")} description={t("addLanguageHint")}>
            <ActionForm action={createLanguageAction} className="flex flex-col gap-3">
              <Field label={t("community")}>
                <select name="communityId" className={inputClass}>
                  {elderCommunities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label={t("name")} hint={t("nameHint")}><input name="name" required className={inputClass} /></Field>
              <Field label={t("endonym")} hint={t("endonymHint")}><input name="endonym" className={inputClass} /></Field>
              <Field label={t("code")} hint={t("codeHint")}><input name="code" required className={`${inputClass} font-mono`} placeholder="qaa" /></Field>
              <Field label={t("notes")}><textarea name="notes" rows={2} className={`${inputClass} h-auto py-2`} placeholder={t("notesPlaceholder")} /></Field>
              <SubmitButton>{t("create")}</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
