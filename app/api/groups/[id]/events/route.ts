import { z } from "zod";
import { type IdParams, notFound, readJson, requireActor, requireElder, route } from "@/lib/api";
import { eventInclude, serializeEvents } from "@/lib/content";
import { db } from "@/lib/db";

const input = z.object({
  title: z.string().trim().min(1).max(140),
  description: z.string().max(4000).optional().nullable(),
  category: z.string().max(40).default("community"),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional().nullable(),
  location: z.string().trim().min(1).max(200),
});

export const POST = route(async (req, { params }: IdParams) => {
  const actor = await requireActor();
  const groupId = (await params).id;
  await requireElder(actor, groupId);
  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group?.communityId) throw notFound("Group not found");
  const data = input.parse(await readJson(req));
  const event = await actor.db.event.create({
    data: { ...data, groupId, communityId: group.communityId, createdById: actor.user.id },
    include: eventInclude,
  });
  return (await serializeEvents(actor, [event]))[0];
});
