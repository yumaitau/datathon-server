import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Field, inputClass } from "@/components/ui";
import { db } from "@/lib/db";
import { requireWebActor } from "@/lib/web";
import { providerEventAction, requestAccessAction } from "../actions";

export default async function Groups() {
  const actor = await requireWebActor("provider");
  const t = await getTranslations("provider");
  const providerId = actor.providerIds[0];
  const [groups, access] = await Promise.all([
    db.group.findMany({ where: { type: "community" }, orderBy: { name: "asc" } }),
    db.providerGroupAccess.findMany({ where: { providerId } }),
  ]);
  const statusOf = (groupId: string) => access.find((a) => a.groupId === groupId)?.status;
  const approved = groups.filter((g) => statusOf(g.id) === "approved");
  const tone = { approved: "accent", requested: "warn", rejected: "danger" } as const;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title={t("groupsTitle")} description={t("groupsHint")}>
        <ul className="flex flex-col divide-y divide-line">
          {groups.map((g) => {
            const s = statusOf(g.id);
            return (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="font-medium">{g.name}</span>
                {s && s !== "rejected" ? (
                  <Badge tone={tone[s]}>{t(`access_${s}`)}</Badge>
                ) : (
                  <form action={requestAccessAction} className="flex items-center gap-2">
                    <input type="hidden" name="groupId" value={g.id} />
                    <input type="hidden" name="message" value={t("defaultRequest")} />
                    {s === "rejected" && <Badge tone="danger">{t("access_rejected")}</Badge>}
                    <SubmitButton size="sm" variant="secondary">{t("requestAccess")}</SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card title={t("postEvent")} description={t("postEventHint")}>
        {approved.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("needApproval")}</p>
        ) : (
          <ActionForm action={providerEventAction} className="flex flex-col gap-3" success={t("eventPosted")}>
            <Field label={t("group")}>
              <select name="groupId" className={inputClass}>{approved.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
            </Field>
            <Field label={t("eventTitle")}><input name="title" required className={inputClass} defaultValue="Health check day" /></Field>
            <Field label={t("when")}><input name="startsAt" type="datetime-local" required className={inputClass} /></Field>
            <Field label={t("where")}><input name="location" required className={inputClass} defaultValue="Clinic verandah" /></Field>
            <Field label={t("details")}><textarea name="description" rows={3} className={`${inputClass} h-auto py-2`} /></Field>
            <SubmitButton>{t("postEventButton")}</SubmitButton>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
