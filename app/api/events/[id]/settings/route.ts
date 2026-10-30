import { z } from "zod";
import { type IdParams, audit, notFound, readJson, requireActor, requireElder, route } from "@/lib/api";
import { eventInclude, serializeEvents } from "@/lib/content";
import { db } from "@/lib/db";

const input = z.object({ commentsEnabled: z.boolean().optional(), threadLocked: z.boolean().optional() });

/** Elder only: turn comments off or lock the thread on an event. */
export const POST = route(async (req, { params }: IdParams) => {
  const actor = await requireActor();
  const event = await db.event.findUnique({ where: { id: (await params).id } });
  if (!event) throw notFound("Event not found");
  await requireElder(actor, event.groupId);
  const updated = await db.event.update({ where: { id: event.id }, data: input.parse(await readJson(req)), include: eventInclude });
  await audit(actor.user.id, "event.settings", "Event", event.id);
  return (await serializeEvents(actor, [updated]))[0];
});
