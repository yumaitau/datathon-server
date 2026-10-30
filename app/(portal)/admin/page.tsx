import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, EmptyState, Field, Table, Td, inputClass } from "@/components/ui";
import { db } from "@/lib/db";
import { nominationAction, onboardProviderAction, verifyProviderAction } from "./actions";

export default async function AdminHome() {
  const t = await getTranslations("admin");
  const [nominations, providers] = await Promise.all([
    db.elderNomination.findMany({ where: { status: "pending" }, include: { nominee: true, group: true } }),
    db.provider.findMany({ include: { _count: { select: { staff: true } } }, orderBy: { name: "asc" } }),
  ]);
  const nominators = new Map((await db.user.findMany({ where: { id: { in: nominations.map((n) => n.nominatedBy) } } })).map((u) => [u.id, u.name]));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-6">
        <Card title={t("nominations")} description={t("nominationsHint")}>
          {nominations.length === 0 ? <EmptyState>{t("noNominations")}</EmptyState> : (
            <ul className="flex flex-col divide-y divide-line">
              {nominations.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium">{n.nominee.name}</span>
                    <span className="text-xs text-ink-muted">{t("nominatedBy", { group: n.group.name, by: nominators.get(n.nominatedBy) ?? "" })}</span>
                  </div>
                  <form action={nominationAction} className="flex gap-2">
                    <input type="hidden" name="id" value={n.id} />
                    <SubmitButton size="sm" variant="secondary" name="decision" value="rejected">{t("reject")}</SubmitButton>
                    <SubmitButton size="sm" name="decision" value="verified">{t("verify")}</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t("providers")} description={t("providersHint")}>
          <Table head={[t("provider"), t("type"), t("staff"), t("status"), ""]}>
            {providers.map((p) => (
              <tr key={p.id}>
                <Td><span className="font-medium">{p.name}</span><br /><span className="text-xs text-ink-muted">{p.address}</span></Td>
                <Td>{p.type}</Td>
                <Td className="tabular-nums">{p._count.staff}</Td>
                <Td><Badge tone={p.verified ? "accent" : "warn"}>{p.verified ? t("verified") : t("unverified")}</Badge></Td>
                <Td className="text-right">
                  <form action={verifyProviderAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <SubmitButton size="sm" variant="ghost" name="verified" value={p.verified ? "false" : "true"}>{p.verified ? t("suspend") : t("verify")}</SubmitButton>
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
      <Card title={t("onboard")} description={t("onboardHint")}>
        <ActionForm action={onboardProviderAction} className="flex flex-col gap-3" success={t("onboarded")}>
          <Field label={t("provider")}><input name="name" required className={inputClass} /></Field>
          <Field label={t("type")}>
            <select name="type" className={inputClass}>
              {["clinic", "dental", "hospital", "legal", "housing", "transport", "mental_health"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label={t("address")}><input name="address" required className={inputClass} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("lat")}><input name="lat" required inputMode="decimal" className={inputClass} defaultValue="-22.9" /></Field>
            <Field label={t("lng")}><input name="lng" required inputMode="decimal" className={inputClass} defaultValue="134.6" /></Field>
          </div>
          <Field label={t("staffName")}><input name="staffName" required className={inputClass} /></Field>
          <Field label={t("staffPhone")}><input name="staffPhone" type="tel" required className={inputClass} /></Field>
          <SubmitButton>{t("onboardButton")}</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
