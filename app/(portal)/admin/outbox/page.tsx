import { getTranslations } from "next-intl/server";
import { Badge, Card, EmptyState, Table, Td } from "@/components/ui";
import { db } from "@/lib/db";
import { formatWhen } from "@/lib/time";

/** Every SMS and push the server sent. With AWS/APNs mocked, this is where they "arrive". */
export default async function Outbox() {
  const t = await getTranslations("admin");
  const logs = await db.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const live = { sms: process.env.SNS_ENABLED === "true", push: !!process.env.APNS_KEY_ID };
  return (
    <Card
      title={t("outboxTitle")}
      description={t("outboxHint")}
      actions={
        <div className="flex gap-2">
          <Badge tone={live.sms ? "accent" : "warn"}>{live.sms ? t("snsLive") : t("snsMock")}</Badge>
          <Badge tone={live.push ? "accent" : "warn"}>{live.push ? t("apnsLive") : t("apnsMock")}</Badge>
        </div>
      }
    >
      {logs.length === 0 ? <EmptyState>{t("outboxEmpty")}</EmptyState> : (
        <Table head={[t("sent"), t("channel"), t("to"), t("message"), t("result")]}>
          {logs.map((l) => (
            <tr key={l.id}>
              <Td className="whitespace-nowrap text-ink-muted">{formatWhen(l.createdAt)}</Td>
              <Td><Badge tone={l.channel === "sms" ? "info" : "neutral"}>{l.channel.toUpperCase()}</Badge></Td>
              <Td className="font-mono text-xs">{l.to}</Td>
              <Td className="max-w-md">{l.body}</Td>
              <Td><Badge tone={l.status === "sent" ? "accent" : "danger"}>{l.provider} · {l.status}</Badge>{l.error && <p className="mt-1 text-xs text-danger">{l.error}</p>}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
