import { type IdParams, audit, notFound, requireActor, route } from "@/lib/api";
import { serializeCarerLink } from "@/lib/carers";
import { db } from "@/lib/db";
import { rescheduleFor } from "@/lib/health";

/** Revokes consent. Either side can end it; the carer loses access immediately. */
export const DELETE = route(async (_req, { params }: IdParams) => {
  const actor = await requireActor();
  const link = await db.carerLink.findUnique({ where: { id: (await params).id } });
  if (!link || (link.userId !== actor.user.id && link.carerId !== actor.user.id)) throw notFound("Carer not found");
  const updated = await db.carerLink.update({
    where: { id: link.id },
    data: { status: "revoked", revokedAt: new Date() },
    include: { carer: true, person: true },
  });
  await audit(actor.user.id, "carer.revoke", "CarerLink", link.id);
  await rescheduleFor(link.userId);
  return serializeCarerLink(updated);
});
