import { type IdParams, ageOf, requireActor, requireElder, route } from "@/lib/api";
import { postInclude, serializePosts } from "@/lib/content";
import { db } from "@/lib/db";

/** Elder queue: join requests, posts awaiting approval, clinic requests, reported comments. */
export const GET = route(async (_req, { params }: IdParams) => {
  const actor = await requireActor();
  const groupId = (await params).id;
  await requireElder(actor, groupId);
  const [memberships, posts, providerRequests, reports] = await Promise.all([
    db.membership.findMany({
      where: { groupId, status: "pending" },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    db.post.findMany({
      where: { groupId, status: "pending" },
      include: postInclude,
      orderBy: { createdAt: "asc" },
    }),
    db.providerGroupAccess.findMany({
      where: { groupId, status: "requested" },
      include: { provider: true },
      orderBy: { createdAt: "asc" },
    }),
    db.report.findMany({
      where: { status: "open", comment: { OR: [{ post: { groupId } }, { event: { groupId } }] } },
      include: { comment: { include: { author: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    memberships: memberships.map((m) => {
      const age = ageOf(m.user.dateOfBirth);
      return {
        id: m.id,
        user: { id: m.user.id, name: m.user.name, phoneNumber: m.user.phoneNumber, isMinor: age != null && age < 18 },
        guardianConsent: !!m.guardianConsentAt,
        createdAt: m.createdAt,
      };
    }),
    posts: await serializePosts(actor, posts),
    providerRequests: providerRequests.map((r) => ({
      id: r.id,
      provider: { id: r.provider.id, name: r.provider.name, type: r.provider.type, address: r.provider.address },
      message: r.message,
      status: r.status,
      createdAt: r.createdAt,
    })),
    reports: reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      createdAt: r.createdAt,
      comment: {
        id: r.comment.id,
        author: r.comment.author,
        body: r.comment.body,
        parentCommentId: r.comment.parentCommentId,
        status: r.comment.status,
        createdAt: r.comment.createdAt,
        replies: [],
      },
    })),
  };
});
