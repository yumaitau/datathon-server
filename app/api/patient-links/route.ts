import { requireActor, route } from "@/lib/api";
import { db } from "@/lib/db";
import { serializeInvite } from "@/lib/patients";

/** Clinic invites addressed to the signed-in user's phone number. */
export const GET = route(async () => {
  const actor = await requireActor();
  const links = await db.patientLink.findMany({
    where: {
      status: { not: "revoked" },
      OR: [{ userId: actor.user.id }, { invitedPhone: actor.user.phoneNumber ?? "-" }],
    },
    include: { provider: true },
    orderBy: { createdAt: "desc" },
  });
  return links.map(serializeInvite);
});
