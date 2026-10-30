import { type IdParams, ageOf, requireActor, requireElder, route } from "@/lib/api";
import { db } from "@/lib/db";

/** Elder only: active members, so Elders can remove people or appoint language custodians in the app. */
export const GET = route(async (_req, { params }: IdParams) => {
  const actor = await requireActor();
  const groupId = (await params).id;
  await requireElder(actor, groupId);
  const members = await db.membership.findMany({
    where: { groupId, status: "active" },
    include: { user: true },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
  });
  return members.map((m) => {
    const age = ageOf(m.user.dateOfBirth);
    return {
      id: m.id,
      user: { id: m.user.id, name: m.user.name, isMinor: age != null && age < 18 },
      role: m.role,
      canTranslate: m.canTranslate,
      joinedAt: m.createdAt,
    };
  });
});
