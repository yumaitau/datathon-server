import { requireActor, route } from "@/lib/api";
import { db } from "@/lib/db";
import { serializeMembership } from "@/lib/sync";

export const GET = route(async () => {
  const actor = await requireActor();
  const memberships = await db.membership.findMany({
    where: { userId: actor.user.id, status: { not: "removed" } },
    include: { group: true },
  });
  const u = actor.user;
  return {
    user: { id: u.id, name: u.name, phoneNumber: u.phoneNumber, dateOfBirth: u.dateOfBirth, gender: u.gender },
    memberships: memberships.map(serializeMembership),
    isElderOf: [...actor.elderGroupIds],
  };
});
