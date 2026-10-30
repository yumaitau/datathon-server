import { getTranslations } from "next-intl/server";
import { Bars, WeeklyLines } from "@/components/charts";
import { Card, Stat, Table, Td } from "@/components/ui";
import { db } from "@/lib/db";
import { postApprovals, topEvents, weeklyActive } from "@/lib/insights";

export default async function Engagement({ params }: PageProps<"/elder/[groupId]/engagement">) {
  const { groupId } = await params;
  const t = await getTranslations("elder");
  const group = await db.group.findUniqueOrThrow({ where: { id: groupId } });
  const communityId = group.communityId ?? groupId;
  const [active, events, approvals, memberCount] = await Promise.all([
    weeklyActive(communityId),
    topEvents(communityId),
    postApprovals(communityId),
    db.membership.count({ where: { groupId: communityId, status: "active" } }),
  ]);
  // The current week is partial, so headline numbers use the last full week.
  const full = active.slice(0, -1);
  const last = full.at(-1)?.active ?? 0;
  const prev = full.at(-5)?.active ?? 0;
  const recent = approvals.slice(-12);
  const decided = recent.filter((w) => w.avgHours != null);
  const avgHours = decided.length ? decided.reduce((s, w) => s + (w.avgHours ?? 0), 0) / decided.length : null;
  const submitted = recent.reduce((s, w) => s + w.submitted, 0);
  const published = recent.reduce((s, w) => s + w.published, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("weeklyActive")} value={last} hint={t("ofMembers", { count: memberCount })} />
        <Stat label={t("changeMonth")} value={`${last - prev >= 0 ? "+" : ""}${last - prev}`} hint={t("vsFourWeeks")} />
        <Stat label={t("postsPublished")} value={`${published} / ${submitted}`} hint={t("last12Weeks")} />
        <Stat label={t("avgDecision")} value={avgHours == null ? "–" : `${avgHours.toFixed(1)} h`} hint={t("memberPostsOnly")} />
      </div>
      <Card title={t("weeklyActiveTitle")} description={t("weeklyActiveHint")}>
        <WeeklyLines data={full.map((w) => ({ x: w.week, active: w.active }))} lines={[{ key: "active", label: t("weeklyActive"), series: 0 }]} />
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("topEvents")} description={t("topEventsHint")}>
          <Bars data={events.map((e) => ({ label: e.title, value: e.going, note: e.startsAt.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) }))} />
        </Card>
        <Card title={t("rsvpTable")}>
          <Table head={[t("event"), t("going"), t("maybe"), t("notGoing")]}>
            {events.map((e) => (
              <tr key={e.id}>
                <Td><span className="font-medium">{e.title}</span><br /><span className="text-xs text-ink-muted">{e.startsAt.toLocaleDateString("en-AU")}</span></Td>
                <Td className="tabular-nums">{e.going}</Td>
                <Td className="tabular-nums">{e.maybe}</Td>
                <Td className="tabular-nums">{e.declined}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
      <p className="text-xs text-ink-faint">{t("liveQuery")}</p>
    </div>
  );
}
