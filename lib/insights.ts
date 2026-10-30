import { db } from "@/lib/db";

// Live queries over the SQL views in prisma/migrations/*_insights_views.
// Provider views already apply the minimum cell size; a null count means "<5".

const num = (v: unknown) => (v == null ? null : Number(v));

export type Cell = number | null;

export async function dnaWeekly(providerId: string) {
  const rows = await db.$queryRaw<
    { week: Date; community_id: string | null; community_name: string; total: unknown; missed: unknown; dna_rate: unknown }[]
  >`SELECT week, community_id, community_name, total, missed, dna_rate
      FROM v_dna_weekly WHERE provider_id = ${providerId} ORDER BY week`;
  return rows.map((r) => ({
    week: r.week.toISOString().slice(0, 10),
    communityId: r.community_id,
    community: r.community_name,
    total: num(r.total),
    missed: num(r.missed),
    rate: num(r.dna_rate),
  }));
}

export async function dnaByType(providerId: string) {
  const rows = await db.$queryRaw<{ type: string; total: unknown; missed: unknown; dna_rate: unknown }[]>`
    SELECT type, total, missed, dna_rate FROM v_dna_by_type
     WHERE provider_id = ${providerId} ORDER BY dna_rate DESC NULLS LAST`;
  return rows.map((r) => ({ type: r.type, total: num(r.total), missed: num(r.missed), rate: num(r.dna_rate) }));
}

export async function dnaByCommunity(providerId: string) {
  const rows = await db.$queryRaw<{ community_name: string | null; total: unknown; missed: unknown; dna_rate: unknown }[]>`
    SELECT community_name, total, missed, dna_rate FROM v_dna_by_community
     WHERE provider_id = ${providerId} ORDER BY community_name`;
  return rows.map((r) => ({
    community: r.community_name ?? "Not linked to a community",
    total: num(r.total),
    missed: num(r.missed),
    rate: num(r.dna_rate),
  }));
}

export const REMINDER_LABELS: Record<string, string> = {
  none: "No reminder",
  push: "App push",
  sms: "SMS",
  carer: "Carer also notified",
};

export async function reminderEffectiveness(providerId: string) {
  const rows = await db.$queryRaw<{ reminder_category: string; total: unknown; attended: unknown; attendance_rate: unknown }[]>`
    SELECT reminder_category, total, attended, attendance_rate FROM v_reminder_effectiveness
     WHERE provider_id = ${providerId}`;
  const order = ["none", "push", "sms", "carer"];
  return order.map((k) => {
    const r = rows.find((x) => x.reminder_category === k);
    return {
      key: k,
      label: REMINDER_LABELS[k],
      total: num(r?.total),
      attended: num(r?.attended),
      rate: num(r?.attendance_rate),
    };
  });
}

export async function weeklyActive(communityId: string) {
  const rows = await db.$queryRaw<{ week: Date; active_members: unknown }[]>`
    SELECT week, active_members FROM v_weekly_active WHERE community_id = ${communityId} ORDER BY week`;
  return rows.map((r) => ({ week: r.week.toISOString().slice(0, 10), active: Number(r.active_members) }));
}

export async function topEvents(communityId: string, limit = 8) {
  const rows = await db.$queryRaw<
    { event_id: string; title: string; category: string; starts_at: Date; going: unknown; maybe: unknown; declined: unknown }[]
  >`SELECT event_id, title, category, starts_at, going, maybe, declined FROM v_event_rsvps
     WHERE community_id = ${communityId} AND starts_at < now()
     ORDER BY going DESC, starts_at DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    id: r.event_id,
    title: r.title,
    category: r.category,
    startsAt: r.starts_at,
    going: Number(r.going),
    maybe: Number(r.maybe),
    declined: Number(r.declined),
  }));
}

export async function postApprovals(communityId: string) {
  const rows = await db.$queryRaw<
    { week: Date; submitted: unknown; published: unknown; rejected: unknown; pending: unknown; avg_hours_to_decision: unknown }[]
  >`SELECT week, submitted, published, rejected, pending, avg_hours_to_decision FROM v_post_approvals
     WHERE community_id = ${communityId} ORDER BY week`;
  return rows.map((r) => ({
    week: r.week.toISOString().slice(0, 10),
    submitted: Number(r.submitted),
    published: Number(r.published),
    rejected: Number(r.rejected),
    pending: Number(r.pending),
    avgHours: num(r.avg_hours_to_decision),
  }));
}

export async function serviceGaps() {
  const rows = await db.$queryRaw<
    {
      community_id: string;
      community_name: string;
      community_lat: number;
      community_lng: number;
      service_type: string;
      provider_name: string;
      provider_lat: number;
      provider_lng: number;
      distance_km: unknown;
      travel_minutes: unknown;
    }[]
  >`SELECT * FROM v_service_gap ORDER BY community_name, service_type`;
  return rows.map((r) => ({
    communityId: r.community_id,
    community: r.community_name,
    communityLat: r.community_lat,
    communityLng: r.community_lng,
    serviceType: r.service_type,
    provider: r.provider_name,
    providerLat: r.provider_lat,
    providerLng: r.provider_lng,
    km: Number(r.distance_km),
    minutes: Number(r.travel_minutes),
  }));
}
