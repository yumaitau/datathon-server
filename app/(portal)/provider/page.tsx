import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, ButtonLink, Card, Field, Table, Td, inputClass } from "@/components/ui";
import { db } from "@/lib/db";
import { requireWebActor } from "@/lib/web";
import { inviteAction } from "./actions";

export default async function Patients() {
  const actor = await requireWebActor("provider");
  const t = await getTranslations("provider");
  const links = await db.patientLink.findMany({
    where: { providerId: actor.providerIds[0] },
    include: { _count: { select: { appointments: { where: { startsAt: { gte: new Date() }, status: { in: ["booked", "confirmed"] } } } } } },
    orderBy: { updatedAt: "desc" },
  });
  const tone = { accepted: "accent", invited: "warn", revoked: "danger" } as const;
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card title={t("invite")} description={t("inviteHint")}>
        <ActionForm action={inviteAction} className="flex flex-col gap-3" success={t("invited")}>
          <Field label={t("patientName")}><input name="displayName" required className={inputClass} /></Field>
          <Field label={t("mobile")} hint={t("mobileHint")}><input name="phoneNumber" type="tel" required className={inputClass} placeholder="0400 000 006" /></Field>
          <SubmitButton>{t("sendInvite")}</SubmitButton>
        </ActionForm>
      </Card>
      <Card title={t("patientsCount", { count: links.length })} description={t("patientsHint")}>
        <Table head={[t("patient"), t("status"), t("upcoming"), ""]}>
          {links.slice(0, 60).map((l) => (
            <tr key={l.id}>
              <Td><span className="font-medium">{l.displayName}</span><br /><span className="text-xs text-ink-muted">{l.invitedPhone}</span></Td>
              <Td><Badge tone={tone[l.status]}>{t(`link_${l.status}`)}</Badge></Td>
              <Td className="tabular-nums">{l._count.appointments}</Td>
              <Td className="text-right">
                {l.status !== "revoked" && <ButtonLink size="sm" variant="ghost" href={`/provider/appointments?patient=${l.id}`}>{t("book")}</ButtonLink>}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
