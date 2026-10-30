"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, inputClass } from "@/components/ui";
import { type RowState, saveTranslationAction } from "./actions";

const tone = { approved: "accent", draft: "warn", missing: "neutral" } as const;

export function TranslationRow({ rowId, languageId, entry, value, status, canApprove }: {
  rowId: string;
  languageId: string;
  entry: { key: string; namespace: string; source: string; args: string[] };
  value: string;
  status: "approved" | "draft" | "missing";
  canApprove: boolean;
}) {
  const t = useTranslations("languages");
  const [state, action] = useActionState<RowState, FormData>(saveTranslationAction, {});
  const shown = (state.status as keyof typeof tone | undefined) ?? status;
  const id = `t-${rowId}`;
  return (
    <li className="grid gap-3 py-4 md:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-xs text-ink-faint">{entry.namespace === "app" ? t("iosString") : entry.key}</span>
        <p lang="en" className="text-sm">{entry.source}</p>
        {entry.args.length > 0 && (
          <p className="text-xs text-ink-muted">
            {t("keep")} {entry.args.map((a, i) => <code key={`${a}${i}`} className="mr-1 rounded bg-sunken px-1">{a.startsWith("%") ? a : `{${a}}`}</code>)}
          </p>
        )}
      </div>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="languageId" value={languageId} />
        <input type="hidden" name="key" value={entry.key} />
        <label htmlFor={id} className="sr-only">{t("translationOf", { key: entry.key })}</label>
        <textarea id={id} name="value" rows={Math.min(4, Math.ceil(entry.source.length / 60))} defaultValue={value} className={`${inputClass} h-auto py-2`} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tone[shown]}>{t(`status_${shown}`)}</Badge>
          <span className="flex-1" />
          <SubmitButton size="sm" variant="secondary" name="intent" value="draft">{t("saveDraft")}</SubmitButton>
          {canApprove && <SubmitButton size="sm" name="intent" value="approve">{t("approve")}</SubmitButton>}
        </div>
        <p aria-live="polite" className="text-xs text-danger">{state.error ?? ""}</p>
      </form>
    </li>
  );
}
