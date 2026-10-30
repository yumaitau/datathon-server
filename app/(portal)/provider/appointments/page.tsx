import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, EmptyState, Field, Table, Td, inputClass } from "@/components/ui";
import { db } from "@/lib/db";
import { listAppointments } from "@/lib/provider";
import { formatWhen } from "@/lib/time";
import { requireWebActor } from "@/lib/web";
import { bookAction, runRemindersAction, statusAction } from "../actions";

const TYPES = ["715 health check", "GP review", "Diabetes check", "Immunisation", "Antenatal", "Ear health check", "Dental check-up"];
const statusTone = { booked: "neutral", confirmed: "accent", attended: "accent", missed: "danger", cancelled: "warn" } as const;

export default async function Appointments({ searchParams }: PageProps<"/provider/appointments">) {
  const actor = await requireWebActor("provider");
  const t = await getTranslations("provider");
  const preselect = (await searchParams).patient;
  const [provider, patients, upcoming] = await Promise.all([
    db.provider.findUniqueOrThrow({ where: { id: actor.providerIds[0] } }),
    db.patientLink.findMany({ where: { providerId: actor.providerIds[0], status: { not: "revoked" } }, orderBy: { displayName: "asc" } }),
    listAppointments(actor, { upcoming: true }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card title={t("bookTitle")} description={t("bookHint")}>
        <ActionForm action={bookAction} className="flex flex-col gap-3" success={t("booked")}>
          <Field label={t("patient")}>
            <select name="patientLinkId" required defaultValue={typeof preselect === "string" ? preselect : undefined} className={inputClass}>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName}{p.status === "invited" ? ` (${t("smsOnly")})` : ""}</option>
              ))}
            </select>
          </Field>
          <Field label={t("type")}>
            <input name="type" list="appt-types" required defaultValue="715 health check" className={inputClass} />
            <datalist id="appt-types">{TYPES.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          <Field label={t("when")} hint={t("whenHint")}><input name="startsAt" type="datetime-local" required className={inputClass} /></Field>
          <Field label={t("where")}><input name="location" required defaultValue={provider.address} className={inputClass} /></Field>
          <Field label={t("prep")}><textarea name="prepNotes" rows={2} className={`${inputClass} h-auto py-2`} defaultValue="Bring your Medicare card and any medicines you take." /></Field>
          <Field label={t("transport")}><input name="transportNote" className={inputClass} placeholder={t("transportPlaceholder")} /></Field>
          <SubmitButton>{t("bookButton")}</SubmitButton>
        </ActionForm>
      </Card>

      <Card
        title={t("upcomingTitle")}
        description={t("upcomingHint")}
        actions={
          <form action={runRemindersAction}>
            <SubmitButton size="sm" variant="secondary" pendingLabel={t("sending")}>{t("runReminders")}</SubmitButton>
          </form>
        }
      >
        {upcoming.length === 0 ? <EmptyState>{t("noUpcoming")}</EmptyState> : (
          <Table head={[t("when"), t("patient"), t("type"), t("status"), t("reminders"), ""]}>
            {upcoming.map((a) => {
              const sent = a.reminders.filter((r) => r.deliveryStatus === "sent").length;
              const pending = a.reminders.filter((r) => r.deliveryStatus === "scheduled").length;
              const channels = [...new Set(a.reminders.map((r) => (r.recipient === "carer" ? "carer" : r.channel)))];
              return (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap">{formatWhen(a.startsAt)}</Td>
                  <Td className="font-medium">{a.patientLink.displayName}</Td>
                  <Td>{a.type}</Td>
                  <Td><Badge tone={statusTone[a.status]}>{t(`status_${a.status}`)}</Badge></Td>
                  <Td className="text-xs text-ink-muted">
                    {t("reminderSummary", { sent, pending })}
                    <br />
                    {channels.map((c) => t(`channel_${c}`)).join(" · ")}
                  </Td>
                  <Td>
                    {["booked", "confirmed"].includes(a.status) && (
                      <form action={statusAction} className="flex flex-wrap justify-end gap-1">
                        <input type="hidden" name="id" value={a.id} />
                        <SubmitButton size="sm" variant="ghost" name="status" value="attended">{t("markAttended")}</SubmitButton>
                        <SubmitButton size="sm" variant="ghost" name="status" value="missed">{t("markMissed")}</SubmitButton>
                        <SubmitButton size="sm" variant="ghost" name="status" value="cancelled">{t("cancel")}</SubmitButton>
                      </form>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="text-xs text-ink-faint">{t("auditNote")}</p>
      </Card>
    </div>
  );
}
