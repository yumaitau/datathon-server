import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Field, Table, Td, buttonClass, inputClass } from "@/components/ui";
import { db } from "@/lib/db";
import { custodianAction } from "../../../languages/actions";
import { membershipAction, nominateAction } from "../../actions";

export default async function Members({ params }: PageProps<"/elder/[groupId]/members">) {
  const { groupId } = await params;
  const t = await getTranslations("elder");
  const [members, nominations] = await Promise.all([
    db.membership.findMany({ where: { groupId, status: "active" }, include: { user: true }, orderBy: [{ role: "asc" }, { user: { name: "asc" } }] }),
    db.elderNomination.findMany({ where: { groupId }, include: { nominee: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const elders = members.filter((m) => m.role === "elder");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card title={t("membersCount", { count: members.length })} description={t("membersHint")}>
        <Table head={[t("name"), t("role"), t("joined"), t("custodian"), ""]}>
          {members.map((m) => (
            <tr key={m.id}>
              <Td className="font-medium">{m.user.name}</Td>
              <Td>{m.role === "elder" ? <Badge tone="accent">{t("elderRole")}</Badge> : <span className="text-ink-muted">{t("memberRole")}</span>}</Td>
              <Td className="text-ink-muted">{m.createdAt.toLocaleDateString("en-AU")}</Td>
              <Td>
                {m.role === "elder" ? (
                  <span className="text-xs text-ink-faint">{t("custodianElder")}</span>
                ) : (
                  <form action={custodianAction}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <SubmitButton size="sm" variant={m.canTranslate ? "secondary" : "ghost"} name="canTranslate" value={m.canTranslate ? "false" : "true"}>
                      {m.canTranslate ? t("custodianRemove") : t("custodianAdd")}
                    </SubmitButton>
                  </form>
                )}
              </Td>
              <Td className="text-right">
                {m.role !== "elder" && (
                  <form action={membershipAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <SubmitButton size="sm" variant="ghost" name="action" value="remove">{t("remove")}</SubmitButton>
                  </form>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
      <div className="flex flex-col gap-6">
        <Card title={t("nominate")} description={t("nominateHint")}>
          <ActionForm action={nominateAction} className="flex flex-col gap-3" success={t("nominated")}>
            <input type="hidden" name="groupId" value={groupId} />
            <Field label={t("member")}>
              <select name="nomineeId" required className={inputClass}>
                {members.filter((m) => m.role !== "elder").map((m) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
              </select>
            </Field>
            <SubmitButton variant="secondary">{t("sendNomination")}</SubmitButton>
          </ActionForm>
          {nominations.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm">
              {nominations.map((n) => (
                <li key={n.id} className="flex items-center justify-between">
                  {n.nominee.name}
                  <Badge tone={n.status === "verified" ? "accent" : n.status === "rejected" ? "danger" : "warn"}>{n.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t("dataTitle")} description={t("dataHint")}>
          <div className="flex flex-wrap gap-2">
            <a className={buttonClass("secondary", "sm")} href={`/api/elder/export?groupId=${groupId}&format=json`}>{t("exportJson")}</a>
            <a className={buttonClass("secondary", "sm")} href={`/api/elder/export?groupId=${groupId}&format=csv`}>{t("exportCsv")}</a>
          </div>
          <p className="text-xs text-ink-faint">{t("eldersCount", { count: elders.length })} · {t("deletionNote")}</p>
        </Card>
      </div>
    </div>
  );
}
