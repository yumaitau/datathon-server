import type { Comment, Event, Group, Post, User } from "@/generated/prisma/client";
import { type Actor, notFound } from "@/lib/api";
import { db } from "@/lib/db";

/** Cultural restrictions: gender- and age-restricted posts reach matching members only. */
export function canSeeRestricted(actor: Actor, post: Pick<Post, "restrictGender" | "minAge">) {
  if (post.restrictGender && actor.user.gender !== post.restrictGender) return false;
  if (post.minAge != null && (actor.age == null || actor.age < post.minAge)) return false;
  return true;
}

export function canSeePost(
  actor: Actor,
  post: Pick<Post, "status" | "authorId" | "restrictGender" | "minAge" | "groupId">,
  elderOf: Set<string>,
) {
  if (post.status !== "published" && post.authorId !== actor.user.id && !elderOf.has(post.groupId)) {
    return false;
  }
  // Elders moderating see everything in their groups so they can approve it.
  return elderOf.has(post.groupId) || canSeeRestricted(actor, post);
}

/** Group ids (communities and their sub-groups) this actor governs as an Elder. */
export async function elderGroupSet(actor: Actor) {
  if (actor.elderGroupIds.size === 0) return new Set<string>();
  const governed = await db.group.findMany({
    where: {
      OR: [{ id: { in: [...actor.elderGroupIds] } }, { communityId: { in: [...actor.elderGroupIds] } }],
    },
    select: { id: true },
  });
  return new Set(governed.map((g) => g.id));
}

/** Groups the actor is an active member of, including sub-groups of their communities they joined. */
export function memberGroupIds(actor: Actor) {
  return actor.user.memberships.map((m) => m.groupId);
}

export async function loadVisiblePost(actor: Actor, postId: string) {
  const post = await actor.db.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post not found");
  const elderOf = await elderGroupSet(actor);
  const member = memberGroupIds(actor).includes(post.groupId) || elderOf.has(post.groupId);
  if (!member || !canSeePost(actor, post, elderOf)) throw notFound("Post not found");
  return { post, elderOf };
}

export async function loadVisibleEvent(actor: Actor, eventId: string) {
  const event = await actor.db.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound("Event not found");
  const elderOf = await elderGroupSet(actor);
  if (!memberGroupIds(actor).includes(event.groupId) && !elderOf.has(event.groupId)) {
    throw notFound("Event not found");
  }
  return { event, elderOf };
}

type ReactionCounts = { like: number; heart: number; thinking_of_you: number; deadly: number; aboriginal_flag: number };
const emptyReactions = (): ReactionCounts => ({ like: 0, heart: 0, thinking_of_you: 0, deadly: 0, aboriginal_flag: 0 });

async function reactionSummary(targetType: "post" | "comment" | "event", ids: string[], userId: string) {
  const counts = new Map<string, ReactionCounts>();
  const mine = new Map<string, string[]>();
  if (ids.length === 0) return { counts, mine };
  const rows = await db.reaction.groupBy({
    by: ["targetId", "kind"],
    where: { targetType, targetId: { in: ids } },
    _count: true,
  });
  for (const r of rows) {
    const c = counts.get(r.targetId) ?? emptyReactions();
    c[r.kind] = r._count;
    counts.set(r.targetId, c);
  }
  const own = await db.reaction.findMany({
    where: { targetType, targetId: { in: ids }, userId },
    select: { targetId: true, kind: true },
  });
  for (const r of own) mine.set(r.targetId, [...(mine.get(r.targetId) ?? []), r.kind]);
  return { counts, mine };
}

type PostRow = Post & { group: Pick<Group, "name">; author: Pick<User, "id" | "name"> };

export async function serializePosts(actor: Actor, posts: PostRow[]) {
  const ids = posts.map((p) => p.id);
  const { counts, mine } = await reactionSummary("post", ids, actor.user.id);
  const commentCounts = ids.length
    ? await db.comment.groupBy({
        by: ["postId"],
        where: { postId: { in: ids }, status: "published" },
        _count: true,
      })
    : [];
  const cc = new Map(commentCounts.map((c) => [c.postId, c._count]));
  return posts.map((p) => ({
    id: p.id,
    groupId: p.groupId,
    groupName: p.group.name,
    author: { id: p.author.id, name: p.author.name },
    kind: p.kind,
    title: p.title,
    body: p.body,
    hasMedia: !!p.imageUrl,
    imageUrl: p.kind === "sorry_business" ? null : p.imageUrl,
    status: p.status,
    pinned: p.pinned,
    urgent: p.urgent,
    restrictGender: p.restrictGender,
    minAge: p.minAge,
    deceasedWarning: p.deceasedWarning,
    commentsEnabled: p.commentsEnabled,
    threadLocked: p.threadLocked,
    commentCount: cc.get(p.id) ?? 0,
    reactions: counts.get(p.id) ?? emptyReactions(),
    myReactions: mine.get(p.id) ?? [],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}

export const postInclude = {
  group: { select: { name: true } },
  author: { select: { id: true, name: true } },
} as const;

type EventRow = Event & { group: Pick<Group, "name">; provider: { name: string } | null };

export async function serializeEvents(actor: Actor, events: EventRow[]) {
  const ids = events.map((e) => e.id);
  const rsvps = ids.length
    ? await db.rsvp.groupBy({ by: ["eventId", "response"], where: { eventId: { in: ids } }, _count: true })
    : [];
  const mine = ids.length
    ? await db.rsvp.findMany({ where: { eventId: { in: ids }, userId: actor.user.id } })
    : [];
  const commentCounts = ids.length
    ? await db.comment.groupBy({
        by: ["eventId"],
        where: { eventId: { in: ids }, status: "published" },
        _count: true,
      })
    : [];
  const cc = new Map(commentCounts.map((c) => [c.eventId, c._count]));
  return events.map((e) => {
    const rsvpCounts = { going: 0, maybe: 0, no: 0 };
    for (const r of rsvps) if (r.eventId === e.id) rsvpCounts[r.response] = r._count;
    return {
      id: e.id,
      groupId: e.groupId,
      groupName: e.group.name,
      title: e.title,
      description: e.description,
      category: e.category,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      location: e.location,
      providerName: e.provider?.name ?? null,
      cancelled: !!e.cancelledAt,
      commentsEnabled: e.commentsEnabled,
      threadLocked: e.threadLocked,
      rsvpCounts,
      myRsvp: mine.find((r) => r.eventId === e.id)?.response ?? null,
      commentCount: cc.get(e.id) ?? 0,
      updatedAt: e.updatedAt,
    };
  });
}

export const eventInclude = {
  group: { select: { name: true } },
  provider: { select: { name: true } },
} as const;

type CommentRow = Comment & { author: Pick<User, "id" | "name"> };

/** Threads by default; `flat` returns each comment on its own (e.g. a just-created reply). */
export async function serializeComments(actor: Actor, comments: CommentRow[], moderator: boolean, flat = false) {
  const visible = comments.filter((c) => c.status === "published" || moderator);
  const { counts, mine } = await reactionSummary(
    "comment",
    visible.map((c) => c.id),
    actor.user.id,
  );
  const shape = (c: CommentRow) => ({
    id: c.id,
    author: { id: c.author.id, name: c.author.name },
    body: c.status === "published" ? c.body : moderator ? c.body : "",
    parentCommentId: c.parentCommentId,
    status: c.status,
    reactions: counts.get(c.id) ?? emptyReactions(),
    myReactions: mine.get(c.id) ?? [],
    createdAt: c.createdAt,
  });
  if (flat) return visible.map((c) => ({ ...shape(c), replies: [] }));
  const top = visible.filter((c) => !c.parentCommentId);
  return top.map((c) => ({
    ...shape(c),
    replies: visible.filter((r) => r.parentCommentId === c.id).map((r) => ({ ...shape(r), replies: [] })),
  }));
}

/** Feed for one group: visible posts (pinned first) and upcoming/recent events. */
export async function groupFeed(actor: Actor, groupId: string) {
  const elderOf = await elderGroupSet(actor);
  if (!memberGroupIds(actor).includes(groupId) && !elderOf.has(groupId)) {
    throw notFound("Group not found");
  }
  const posts = await actor.db.post.findMany({
    where: {
      groupId,
      archivedAt: null,
      OR: [{ status: "published" }, { authorId: actor.user.id, status: "pending" }],
    },
    include: postInclude,
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  const events = await actor.db.event.findMany({
    where: { groupId, startsAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
    include: eventInclude,
    orderBy: { startsAt: "asc" },
    take: 30,
  });
  return {
    posts: await serializePosts(
      actor,
      posts.filter((p) => canSeePost(actor, p, elderOf)),
    ),
    events: await serializeEvents(actor, events),
  };
}
