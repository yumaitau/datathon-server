import { getTranslations } from "next-intl/server";
import { Bars, WeeklyLines } from "@/components/charts";
import { Card, Stat, Table, Td, cell } from "@/components/ui";
import { dnaByCommunity, dnaByType, dnaWeekly, reminderEffectiveness } from "@/lib/insights";
import { requireWebActor } from "@/lib/web";

export default async function Insights() {
  const actor = await requireWebActor("provider");
  const t = await getTranslations("provider");
  const providerId = actor.providerIds[0];
  const [weekly, byType, byCommunity, reminders] = await Promise.all([
    dnaWeekly(providerId),
    dnaByType(providerId),
    dnaByCommunity(providerId),
    reminderEffectiveness(providerId),
  ]);

  // Pivot weekly rows into one point per week; series keyed by community id
  // (stable), so colour follows the community, never its rank.
  const communities = [...new Map(weekly.filter((w) => w.communityId).map((w) => [w.communityId!, w.community])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const weeks = [...new Set(weekly.map((w) => w.week))].sort();
  // 4-week rolling rate from counts, so the trend reads through weekly noise.
  // Suppressed (<5) weeks contribute nothing; a window under 5 stays a gap.
  const rolling = (communityId: string | null, i: number) => {
    let total = 0;
    let missed = 0;
    for (const week of weeks.slice(Math.max(0, i - 3), i + 1)) {
      const w = weekly.find((r) => r.week === week && r.communityId === communityId);
      total += w?.total ?? 0;
      missed += w?.missed ?? 0;
    }
    return total < 5 ? null : Math.round((1000 * missed) / total) / 10;
  };
  const points = weeks.slice(3).map((week, j) => {
    const p: Record<string, string | number | null> = { x: week };
    p.all = rolling(null, j + 3);
    for (const [id] of communities) p[id] = rolling(id, j + 3);
    return p as { x: string } & Record<string, number | null | string>;
  });
  const lines = [{ key: "all", label: t("allCommunities"), series: 0 }, ...communities.map(([id, name], i) => ({ key: id, label: name, series: i + 1 }))];

  const none = reminders.find((r) => r.key === "none")?.rate;
  const best = reminders.find((r) => r.key === "carer")?.rate;
  const overall = byCommunity.reduce((acc, c) => ({ total: acc.total + (c.total ?? 0), missed: acc.missed + (c.missed ?? 0) }), { total: 0, missed: 0 });

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("dnaOverall")} value={overall.total ? `${((100 * overall.missed) / overall.total).toFixed(1)}%` : "–"} hint={t("appointmentsCount", { count: overall.total })} />
        <Stat label={t("noReminderAttendance")} value={none == null ? "<5" : `${none}%`} />
        <Stat label={t("carerAttendance")} value={best == null ? "<5" : `${best}%`} hint={none != null && best != null ? t("pointsHigher", { points: (best - none).toFixed(1) }) : undefined} />
      </div>

      <Card title={t("dnaTrend")} description={t("dnaTrendHint")}>
        <WeeklyLines data={points} lines={lines} unit="%" />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("reminderEffect")} description={t("reminderEffectHint")}>
          <Bars data={reminders.map((r) => ({ label: r.label, value: r.rate, note: r.total == null ? undefined : `n=${r.total}` }))} unit="%" />
          <Table head={[t("reminderType"), t("appointmentsCol"), t("attendedCol"), t("rateCol")]}>
            {reminders.map((r) => (
              <tr key={r.key}><Td>{r.label}</Td><Td className="tabular-nums">{cell(r.total)}</Td><Td className="tabular-nums">{cell(r.attended)}</Td><Td className="tabular-nums">{cell(r.rate, "%")}</Td></tr>
            ))}
          </Table>
        </Card>
        <div className="flex flex-col gap-6">
          <Card title={t("dnaByType")}>
            <Bars data={byType.map((r) => ({ label: r.type, value: r.rate, note: r.total == null ? undefined : `n=${r.total}` }))} unit="%" />
          </Card>
          <Card title={t("dnaByCommunity")}>
            <Bars data={byCommunity.map((r) => ({ label: r.community, value: r.rate, note: r.total == null ? undefined : `n=${r.total}` }))} unit="%" />
          </Card>
        </div>
      </div>
      <p className="text-xs text-ink-faint">{t("deidentified")}</p>
    </div>
  );
}
