import { getTranslations } from "next-intl/server";
import { Card, Table, Td } from "@/components/ui";
import { db } from "@/lib/db";
import { formatWhen } from "@/lib/time";

export default async function Audit() {
  const t = await getTranslations("admin");
  const rows = await db.auditLog.findMany({ orderBy: { at: "desc" }, take: 150 });
  const names = new Map(
    (await db.user.findMany({ where: { id: { in: rows.map((r) => r.actorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  return (
    <Card title={t("auditTitle")} description={t("auditHint")}>
      <Table head={[t("when"), t("actor"), t("action"), t("entity"), t("detail")]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap text-ink-muted">{formatWhen(r.at)}</Td>
            <Td>{r.actorId ? names.get(r.actorId) ?? r.actorId : "system"}</Td>
            <Td className="font-mono text-xs">{r.action}</Td>
            <Td className="text-xs">{r.entity}{r.entityId ? ` ${r.entityId.slice(0, 8)}` : ""}</Td>
            <Td className="text-xs text-ink-muted">{r.detail}</Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
