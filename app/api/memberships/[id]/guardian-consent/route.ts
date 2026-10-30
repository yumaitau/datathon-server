import { type IdParams, audit, notFound, requireActor, route } from "@/lib/api";
import { db } from "@/lib/db";

/** A young person's parent or guardian consents to their join request; an Elder then decides. */
export const POST = route(async (_req, { params }: IdParams) => {
  const actor = await requireActor();
  const m = await db.membership.findUnique({ where: { id: (await params).id }, include: { user: true } });
  if (!m || m.user.guardianId !== actor.user.id) throw notFound("Request not found");
  const updated = await db.membership.update({ where: { id: m.id }, data: { guardianConsentAt: new Date() } });
  await audit(actor.user.id, "membership.guardian-consent", "Membership", m.id);
  return { id: updated.id, guardianConsent: true };
});
