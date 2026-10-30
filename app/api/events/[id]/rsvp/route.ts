import { z } from "zod";
import { type IdParams, readJson, requireActor, route } from "@/lib/api";
import { db } from "@/lib/db";
import { rsvp } from "@/lib/mutations";

const input = z.object({
  response: z.enum(["going", "maybe", "no"]),
  clientMutationId: z.string().min(8).max(64).optional(),
  respondedAt: z.coerce.date().optional(),
});

export const POST = route(async (req, { params }: IdParams) => {
  const actor = await requireActor();
  const eventId = (await params).id;
  const { clientMutationId, ...body } = input.parse(await readJson(req));
  const saved = await rsvp(actor, { ...body, eventId }, clientMutationId);
  const rows = await db.rsvp.groupBy({ by: ["response"], where: { eventId }, _count: true });
  const rsvpCounts = { going: 0, maybe: 0, no: 0 };
  for (const r of rows) rsvpCounts[r.response] = r._count;
  return { response: saved.response, rsvpCounts };
});
