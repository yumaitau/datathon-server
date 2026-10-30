import { z } from "zod";
import { type Actor, HttpError, audit, forbidden, notFound, requireProviderStaff } from "@/lib/api";
import { normalisePhone } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyBooked, scheduleReminders } from "@/lib/health";
import { sendSms } from "@/lib/notify";

// Clinic and service staff actions (web portal only).

export const inviteInput = z.object({
  phoneNumber: z.string().min(6),
  displayName: z.string().trim().min(1).max(80),
});

/**
 * Any verified provider may invite an individual by mobile: the patient's own
 * consent (accepting in the app) governs the link. Non-app users get SMS only.
 */
export async function invitePatient(actor: Actor, input: z.infer<typeof inviteInput>) {
  const providerId = requireProviderStaff(actor);
  const provider = await db.provider.findUniqueOrThrow({ where: { id: providerId } });
  if (!provider.verified) throw forbidden("Provider is not verified yet");
  const phone = normalisePhone(input.phoneNumber);
  const user = await db.user.findUnique({ where: { phoneNumber: phone } });
  const link = await db.patientLink.upsert({
    where: { providerId_invitedPhone: { providerId, invitedPhone: phone } },
    create: { providerId, invitedPhone: phone, displayName: input.displayName, userId: user?.id },
    update: { displayName: input.displayName, status: "invited", userId: user?.id },
  });
  await sendSms(
    phone,
    `${provider.name} would like to send you appointment reminders. Open MyMob to accept, or you'll get reminders by SMS.`,
  );
  await audit(actor.user.id, "patient-link.invite", "PatientLink", link.id);
  return link;
}

export const bookInput = z.object({
  patientLinkId: z.string(),
  startsAt: z.coerce.date(),
  type: z.string().trim().min(1).max(80),
  location: z.string().trim().min(1).max(200),
  prepNotes: z.string().max(1000).optional().nullable(),
  transportNote: z.string().max(500).optional().nullable(),
});

async function ownLink(actor: Actor, patientLinkId: string) {
  const providerId = requireProviderStaff(actor);
  const link = await db.patientLink.findUnique({ where: { id: patientLinkId } });
  if (!link || link.providerId !== providerId) throw notFound("Patient not found");
  return link;
}

/** Patient's home community, recorded only for de-identified aggregates. */
async function homeCommunity(userId: string | null) {
  if (!userId) return null;
  const m = await db.membership.findFirst({
    where: { userId, status: "active", group: { type: "community" } },
    orderBy: { createdAt: "asc" },
  });
  return m?.groupId ?? null;
}

export async function bookAppointment(actor: Actor, input: z.infer<typeof bookInput>) {
  const link = await ownLink(actor, input.patientLinkId);
  if (link.status === "revoked") throw new HttpError(409, "This patient has withdrawn consent");
  if (input.startsAt.getTime() < Date.now() - 60_000) throw new HttpError(400, "Pick a time in the future");
  const appt = await db.appointment.create({
    data: { ...input, communityId: await homeCommunity(link.userId) },
  });
  await scheduleReminders(appt.id);
  const channel = await notifyBooked(appt.id);
  await audit(actor.user.id, "appointment.create", "Appointment", appt.id, `notified via ${channel}`);
  return appt;
}

export const updateInput = bookInput.omit({ patientLinkId: true }).partial().extend({
  status: z.enum(["booked", "confirmed", "attended", "missed", "cancelled"]).optional(),
});

export async function updateAppointment(actor: Actor, appointmentId: string, input: z.infer<typeof updateInput>) {
  const providerId = requireProviderStaff(actor);
  const appt = await db.appointment.findUnique({ where: { id: appointmentId }, include: { patientLink: true } });
  if (!appt || appt.patientLink.providerId !== providerId) throw notFound("Appointment not found");
  const updated = await db.appointment.update({ where: { id: appt.id }, data: input });
  if (input.startsAt || input.status === "cancelled") await scheduleReminders(appt.id);
  await audit(actor.user.id, `appointment.${input.status ?? "update"}`, "Appointment", appt.id);
  return updated;
}

/** Staff reads of appointment data are always audit-logged. */
export async function listAppointments(actor: Actor, opts: { upcoming: boolean }) {
  const providerId = requireProviderStaff(actor);
  const now = new Date();
  const rows = await db.appointment.findMany({
    where: {
      patientLink: { providerId },
      startsAt: opts.upcoming ? { gte: new Date(now.getTime() - 86400_000) } : { lt: now },
    },
    include: { patientLink: true, reminders: true },
    orderBy: { startsAt: opts.upcoming ? "asc" : "desc" },
    take: opts.upcoming ? 100 : 50,
  });
  await audit(actor.user.id, "appointment.read", "Appointment", undefined, `${rows.length} rows (${opts.upcoming ? "upcoming" : "past"})`);
  return rows;
}

export async function requestGroupAccess(actor: Actor, groupId: string, message?: string) {
  const providerId = requireProviderStaff(actor);
  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group?.communityId) throw notFound("Group not found");
  const access = await db.providerGroupAccess.upsert({
    where: { providerId_groupId: { providerId, groupId } },
    create: { providerId, groupId, communityId: group.communityId, message },
    update: {},
  });
  if (access.status === "rejected") {
    // A rejected provider can ask again; the Elders decide afresh.
    return db.providerGroupAccess.update({ where: { id: access.id }, data: { status: "requested", message, decidedAt: null, decidedById: null } });
  }
  await audit(actor.user.id, "provider-access.request", "ProviderGroupAccess", access.id);
  return access;
}

export const providerEventInput = z.object({
  groupId: z.string(),
  title: z.string().trim().min(1).max(140),
  description: z.string().max(4000).optional().nullable(),
  startsAt: z.coerce.date(),
  location: z.string().trim().min(1).max(200),
});

/** Only providers an Elder approved for the group can post events to it. */
export async function postProviderEvent(actor: Actor, input: z.infer<typeof providerEventInput>) {
  const providerId = requireProviderStaff(actor);
  const access = await db.providerGroupAccess.findUnique({
    where: { providerId_groupId: { providerId, groupId: input.groupId } },
  });
  if (access?.status !== "approved") throw forbidden("This group hasn't approved your service");
  const event = await db.event.create({
    data: {
      ...input,
      category: "health",
      communityId: access.communityId,
      createdById: actor.user.id,
      providerId,
    },
  });
  await audit(actor.user.id, "event.create", "Event", event.id);
  return event;
}
