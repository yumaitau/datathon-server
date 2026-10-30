import { type IdParams, audit, notFound, requireActor, route } from "@/lib/api";
import { db } from "@/lib/db";
import { scheduleReminders } from "@/lib/health";
import { serializeInvite } from "@/lib/patients";

/** The patient's own consent links them to a clinic. */
export const POST = route(async (_req, { params }: IdParams) => {
  const actor = await requireActor();
  const link = await db.patientLink.findUnique({ where: { id: (await params).id } });
  if (!link || link.status === "revoked") throw notFound("Invite not found");
  if (link.userId !== actor.user.id && link.invitedPhone !== actor.user.phoneNumber) throw notFound("Invite not found");
  const updated = await db.patientLink.update({
    where: { id: link.id },
    data: { status: "accepted", userId: actor.user.id },
    include: { provider: true, appointments: { where: { status: { in: ["booked", "confirmed"] } } } },
  });
  // Reminders can now go by push instead of SMS.
  for (const a of updated.appointments) await scheduleReminders(a.id);
  await audit(actor.user.id, "patient-link.accept", "PatientLink", link.id);
  return serializeInvite(updated);
});
