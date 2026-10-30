import { requireActor, route } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = route(async (req) => {
  await requireActor();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const groups = await db.group.findMany({
    where: { type: { not: "nation" }, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    include: { parent: true, _count: { select: { memberships: { where: { status: "active" } } } } },
    orderBy: { name: "asc" },
    take: 20,
  });
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    type: g.type,
    parentName: g.parent?.name ?? null,
    memberCount: g._count.memberships,
  }));
});
