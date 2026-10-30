import { z } from "zod";
import { HttpError, audit, notFound, readJson, requireActor, route } from "@/lib/api";
import { normalisePhone } from "@/lib/auth";
import { serializeCarerLink } from "@/lib/carers";
import { db } from "@/lib/db";
import { rescheduleFor } from "@/lib/health";

const include = { carer: true, person: true } as const;

export const GET = route(async () => {
  const actor = await requireActor();
  const [myCarers, caringFor] = await Promise.all([
    db.carerLink.findMany({ where: { userId: actor.user.id }, include }),
    db.carerLink.findMany({ where: { carerId: actor.user.id, status: "active" }, include }),
  ]);
  return { myCarers: myCarers.map(serializeCarerLink), caringFor: caringFor.map(serializeCarerLink) };
});

const input = z.object({ phoneNumber: z.string().min(6) });

/** The person nominates a carer: explicit, logged consent to share their appointments. */
export const POST = route(async (req) => {
  const actor = await requireActor();
  const phone = normalisePhone(input.parse(await readJson(req)).phoneNumber);
  const carer = await db.user.findUnique({ where: { phoneNumber: phone } });
  if (!carer) throw notFound("No MyMob account uses that number yet");
  if (carer.id === actor.user.id) throw new HttpError(400, "You can't nominate yourself");
  const link = await db.carerLink.upsert({
    where: { userId_carerId: { userId: actor.user.id, carerId: carer.id } },
    create: { userId: actor.user.id, carerId: carer.id },
    update: { status: "active", consentedAt: new Date(), revokedAt: null },
    include,
  });
  await audit(actor.user.id, "carer.consent", "CarerLink", link.id);
  await rescheduleFor(actor.user.id);
  return serializeCarerLink(link);
});

