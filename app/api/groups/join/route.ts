import { z } from "zod";
import { audit, notFound, readJson, requireActor, route } from "@/lib/api";
import { db } from "@/lib/db";
import { serializeMembership } from "@/lib/sync";

const input = z
  .object({ joinCode: z.string().trim().optional(), groupId: z.string().optional() })
  .refine((v) => v.joinCode || v.groupId, "Provide joinCode or groupId");

/** Requests to join; an Elder approves. Removed members can ask again. */
export const POST = route(async (req) => {
  const actor = await requireActor();
  const { joinCode, groupId } = input.parse(await readJson(req));
  const group = await db.group.findFirst({
    where: joinCode ? { joinCode: { equals: joinCode, mode: "insensitive" } } : { id: groupId },
  });
  if (!group || group.type === "nation") throw notFound("No group with that code");
  const existing = await db.membership.findUnique({
    where: { userId_groupId: { userId: actor.user.id, groupId: group.id } },
    include: { group: true },
  });
  if (existing && existing.status !== "removed") return serializeMembership(existing);
  const membership = await db.membership.upsert({
    where: { userId_groupId: { userId: actor.user.id, groupId: group.id } },
    create: { userId: actor.user.id, groupId: group.id, communityId: group.communityId },
    update: { status: "pending", decidedAt: null, decidedById: null },
    include: { group: true },
  });
  await audit(actor.user.id, "membership.request", "Membership", membership.id);
  return serializeMembership(membership);
});
