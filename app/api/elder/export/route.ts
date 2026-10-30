import { audit, requireActor, requireElder, route } from "@/lib/api";
import { db } from "@/lib/db";

const csvCell = (v: unknown) => {
  const s = v instanceof Date ? v.toISOString() : String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Community data export for Elders (CARE: authority to control). Health data is
 * never included: appointments belong to individuals, not the community.
 */
export const GET = route(async (req) => {
  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId") ?? "";
  const actor = await requireActor();
  await requireElder(actor, groupId);
  const [members, posts, events] = await Promise.all([
    db.membership.findMany({ where: { groupId }, include: { user: { select: { name: true } } } }),
    db.post.findMany({ where: { groupId }, include: { author: { select: { name: true } } } }),
    db.event.findMany({ where: { groupId }, include: { _count: { select: { rsvps: true } } } }),
  ]);
  await audit(actor.user.id, "community.export", "Group", groupId);
  const stamp = new Date().toISOString().slice(0, 10);
  if (url.searchParams.get("format") === "csv") {
    const rows = [
      ["section", "id", "name_or_title", "status", "created_at", "detail"],
      ...members.map((m) => ["member", m.id, m.user.name, m.status, m.createdAt, m.role]),
      ...posts.map((p) => ["post", p.id, p.title ?? "", p.status, p.createdAt, p.body]),
      ...events.map((e) => ["event", e.id, e.title, e.cancelledAt ? "cancelled" : "active", e.startsAt, `${e._count.rsvps} RSVPs`]),
    ];
    return new Response(rows.map((r) => r.map(csvCell).join(",")).join("\n"), {
      headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="community-${stamp}.csv"` },
    });
  }
  return new Response(
    JSON.stringify(
      {
        exportedAt: new Date(),
        members: members.map((m) => ({ id: m.id, name: m.user.name, role: m.role, status: m.status, joinedAt: m.createdAt })),
        posts: posts.map((p) => ({ id: p.id, kind: p.kind, title: p.title, body: p.body, status: p.status, author: p.author.name, createdAt: p.createdAt })),
        events: events.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, location: e.location, rsvps: e._count.rsvps })),
      },
      null,
      2,
    ),
    { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="community-${stamp}.json"` } },
  );
});
