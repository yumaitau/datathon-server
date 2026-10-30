import { gzipSync } from "node:zlib";
import { z } from "zod";
import type { Actor } from "@/lib/api";
import {
  canSeePost,
  elderGroupSet,
  eventInclude,
  memberGroupIds,
  postInclude,
  serializeEvents,
  serializePosts,
} from "@/lib/content";
import { db } from "@/lib/db";
import { caredForIds, visibleAppointments } from "@/lib/health";
import { applyMutations } from "@/lib/mutations";

export const syncInput = z.object({
  cursor: z.string().optional().nullable(),
  mutations: z.array(z.unknown()).max(200).default([]),
});

function parseCursor(cursor?: string | null) {
  if (!cursor) return undefined;
  const d = new Date(cursor);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function recordActivity(actor: Actor) {
  const day = new Date(new Date().toISOString().slice(0, 10));
  await db.activity.createMany({
    data: actor.communityIds.map((communityId) => ({ userId: actor.user.id, communityId, day })),
    skipDuplicates: true,
  });
}

/** Carer links and memberships are tiny, so they are always sent in full. */
async function relationships(actor: Actor) {
  const [myCarers, caringFor, memberships] = await Promise.all([
    db.carerLink.findMany({ where: { userId: actor.user.id }, include: { carer: true, person: true } }),
    db.carerLink.findMany({ where: { carerId: actor.user.id }, include: { carer: true, person: true } }),
    db.membership.findMany({ where: { userId: actor.user.id }, include: { group: true } }),
  ]);
  const link = (l: (typeof myCarers)[number]) => ({
    id: l.id,
    person: { id: l.person.id, name: l.person.name },
    carer: { id: l.carer.id, name: l.carer.name, phoneNumber: l.carer.phoneNumber },
    status: l.status,
    consentedAt: l.consentedAt,
    revokedAt: l.revokedAt,
  });
  return {
    carers: { myCarers: myCarers.map(link), caringFor: caringFor.map(link) },
    memberships: memberships.map(serializeMembership),
  };
}

export function serializeMembership(m: {
  id: string;
  groupId: string;
  role: string;
  status: string;
  group: { name: string; type: string; communityId: string | null };
}) {
  return {
    id: m.id,
    groupId: m.groupId,
    groupName: m.group.name,
    groupType: m.group.type,
    communityId: m.group.communityId,
    role: m.role,
    status: m.status,
  };
}

/** Changed posts and events since the cursor in the actor's groups. */
async function contentDelta(actor: Actor, since?: Date) {
  const groupIds = memberGroupIds(actor);
  const elderOf = await elderGroupSet(actor);
  const changed = since ? { updatedAt: { gt: since } } : {};
  const posts = await actor.db.post.findMany({
    where: {
      groupId: { in: groupIds },
      ...changed,
      OR: [{ status: "published" }, { authorId: actor.user.id }],
    },
    include: postInclude,
    orderBy: { updatedAt: "desc" },
    take: since ? 200 : 100,
  });
  const events = await actor.db.event.findMany({
    where: {
      groupId: { in: groupIds },
      ...changed,
      ...(since ? {} : { startsAt: { gte: new Date(Date.now() - 7 * 86400_000) } }),
    },
    include: eventInclude,
    orderBy: { startsAt: "asc" },
    take: 100,
  });
  // Archived (sorry business) and rejected posts become removal notices, so offline caches drop them.
  const gone = (p: (typeof posts)[number]) => !!p.archivedAt || p.status === "rejected";
  return {
    posts: posts.filter((p) => !gone(p) && canSeePost(actor, p, elderOf)),
    removedPostIds: posts.filter(gone).map((p) => p.id),
    events,
  };
}

export async function fullSync(actor: Actor, input: z.infer<typeof syncInput>) {
  const serverTime = new Date();
  const results = await applyMutations(actor, input.mutations);
  const since = parseCursor(input.cursor);
  await recordActivity(actor);
  const { posts, events, removedPostIds } = await contentDelta(actor, since);
  return {
    cursor: serverTime.toISOString(),
    serverTime,
    results,
    appointments: await visibleAppointments(actor, since),
    posts: await serializePosts(actor, posts),
    removedPostIds,
    events: await serializeEvents(actor, events),
    ...(await relationships(actor)),
  };
}

const LITE_BODY_CHARS = 280;

/**
 * Satellite / ultra-constrained variant: same request, but only essentials in
 * priority order (appointments → write acks → urgent and sorry business notices),
 * text only, minimal fields. Everything else is counted and deferred.
 */
export async function liteSync(actor: Actor, input: z.infer<typeof syncInput>) {
  const serverTime = new Date();
  const results = await applyMutations(actor, input.mutations);
  const since = parseCursor(input.cursor);
  await recordActivity(actor);
  const caring = await caredForIds(actor.user.id);
  const appts = await db.appointment.findMany({
    where: {
      patientLink: { status: "accepted", userId: { in: [actor.user.id, ...caring] } },
      ...(since ? { updatedAt: { gt: since } } : { startsAt: { gte: new Date(Date.now() - 86400_000) } }),
    },
    select: {
      id: true,
      startsAt: true,
      location: true,
      type: true,
      status: true,
      updatedAt: true,
      patientLink: { select: { userId: true, provider: { select: { name: true } } } },
    },
    orderBy: { startsAt: "asc" },
    take: 20,
  });
  const { posts, events, removedPostIds } = await contentDelta(actor, since);
  const notices = posts.filter(
    (p) => p.status === "published" && (p.urgent || p.kind === "sorry_business"),
  );
  return {
    cursor: serverTime.toISOString(),
    serverTime,
    lite: true,
    // Lite acks drop the entity echo; the client only needs to clear its queue.
    results: results.map((r) => ({
      clientMutationId: r.clientMutationId,
      status: r.status,
      ...(r.error ? { error: r.error } : {}),
    })),
    appointments: appts.map((a) => ({
      id: a.id,
      startsAt: a.startsAt,
      location: a.location,
      type: a.type,
      status: a.status,
      providerName: a.patientLink.provider.name,
      isMine: a.patientLink.userId === actor.user.id,
      updatedAt: a.updatedAt,
    })),
    notices: notices.slice(0, 10).map((p) => ({
      id: p.id,
      groupId: p.groupId,
      kind: p.kind,
      title: p.title,
      body: p.body.length > LITE_BODY_CHARS ? `${p.body.slice(0, LITE_BODY_CHARS - 1)}…` : p.body,
      createdAt: p.createdAt,
    })),
    removedPostIds,
    deferred: { posts: posts.length - notices.length, events: events.length },
  };
}

/** JSON response, gzipped when the client accepts it, with size headers for the demo network log. */
export function compactJson(req: Request, body: unknown) {
  const raw = Buffer.from(JSON.stringify(body));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-payload-bytes": String(raw.length),
    "cache-control": "no-store",
  };
  if ((req.headers.get("accept-encoding") ?? "").includes("gzip")) {
    const gz = gzipSync(raw, { level: 9 });
    headers["content-encoding"] = "gzip";
    headers["x-compressed-bytes"] = String(gz.length);
    return new Response(new Uint8Array(gz), { headers });
  }
  headers["x-compressed-bytes"] = String(raw.length);
  return new Response(new Uint8Array(raw), { headers });
}
