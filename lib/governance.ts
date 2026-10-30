import { type Actor, HttpError, ageOf, audit, forbidden, notFound, requireElder } from "@/lib/api";
import { db } from "@/lib/db";

// Elder decisions. Shared by the iOS endpoints and the Elder web portal.

export type MembershipAction = "approve" | "reject" | "remove";

export async function decideMembership(actor: Actor, membershipId: string, action: MembershipAction) {
  const m = await db.membership.findUnique({ where: { id: membershipId }, include: { user: true } });
  if (!m) throw notFound("Request not found");
  await requireElder(actor, m.groupId);
  if (action === "remove" && m.role === "elder") throw forbidden("Elder roles change through nomination");
  if (action === "approve") {
    const age = ageOf(m.user.dateOfBirth);
    // Under-18 safeguard: a parent or guardian must consent before an Elder can approve.
    if (age != null && age < 18 && !m.guardianConsentAt) {
      throw new HttpError(409, "Waiting for parent or guardian consent");
    }
  }
  const status = action === "approve" ? "active" : "removed";
  const updated = await db.membership.update({
    where: { id: m.id },
    data: { status, decidedById: actor.user.id, decidedAt: new Date() },
  });
  await audit(actor.user.id, `membership.${action}`, "Membership", m.id);
  return updated;
}

export type PostAction = "approve" | "reject" | "pin" | "settings";

export async function moderatePost(
  actor: Actor,
  postId: string,
  action: PostAction,
  opts: { pinned?: boolean; commentsEnabled?: boolean; threadLocked?: boolean; deceasedWarning?: boolean } = {},
) {
  const post = await db.post.findUnique({ where: { id: postId } });
  if (!post) throw notFound("Post not found");
  await requireElder(actor, post.groupId);
  const data =
    action === "approve"
      ? { status: "published" as const, pinned: opts.pinned ?? post.pinned, decidedById: actor.user.id, decidedAt: new Date() }
      : action === "reject"
        ? { status: "rejected" as const, pinned: false, decidedById: actor.user.id, decidedAt: new Date() }
        : action === "pin"
          ? { pinned: !!opts.pinned }
          : {
              commentsEnabled: opts.commentsEnabled ?? post.commentsEnabled,
              threadLocked: opts.threadLocked ?? post.threadLocked,
              deceasedWarning: opts.deceasedWarning ?? post.deceasedWarning,
            };
  const updated = await db.post.update({ where: { id: post.id }, data });
  await audit(actor.user.id, `post.${action}`, "Post", post.id);
  return updated;
}

export async function hideComment(actor: Actor, commentId: string, status: "hidden" | "removed" = "hidden") {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    include: { post: true, event: true },
  });
  const groupId = comment?.post?.groupId ?? comment?.event?.groupId;
  if (!comment || !groupId) throw notFound("Comment not found");
  await requireElder(actor, groupId);
  const updated = await db.comment.update({ where: { id: comment.id }, data: { status } });
  await db.report.updateMany({ where: { commentId: comment.id, status: "open" }, data: { status: "actioned" } });
  await audit(actor.user.id, `comment.${status}`, "Comment", comment.id);
  return updated;
}

export async function dismissReport(actor: Actor, reportId: string) {
  const report = await db.report.findUnique({
    where: { id: reportId },
    include: { comment: { include: { post: true, event: true } } },
  });
  const groupId = report?.comment.post?.groupId ?? report?.comment.event?.groupId;
  if (!report || !groupId) throw notFound("Report not found");
  await requireElder(actor, groupId);
  return db.report.update({ where: { id: report.id }, data: { status: "dismissed" } });
}

export async function decideProviderAccess(actor: Actor, accessId: string, decision: "approved" | "rejected") {
  const access = await db.providerGroupAccess.findUnique({ where: { id: accessId } });
  if (!access) throw notFound("Request not found");
  await requireElder(actor, access.groupId);
  const updated = await db.providerGroupAccess.update({
    where: { id: access.id },
    data: { status: decision, decidedById: actor.user.id, decidedAt: new Date() },
  });
  await audit(actor.user.id, `provider-access.${decision}`, "ProviderGroupAccess", access.id);
  return updated;
}
