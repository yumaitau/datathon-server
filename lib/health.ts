import type { Appointment, PatientLink, Provider, User } from "@/generated/prisma/client";
import { type Actor, notFound } from "@/lib/api";
import { db } from "@/lib/db";
import { sendPush, sendSms } from "@/lib/notify";

const TZ = process.env.APP_TIMEZONE ?? "Australia/Darwin";
export const REMINDER_OFFSETS_H = [48, 2];

type AppointmentRow = Appointment & {
  patientLink: PatientLink & { provider: Provider; user: Pick<User, "id" | "name"> | null };
};

export const appointmentInclude = {
  patientLink: { include: { provider: true, user: { select: { id: true, name: true } } } },
} as const;

/** People who nominated the actor as their carer (consent active). */
export async function caredForIds(userId: string) {
  const links = await db.carerLink.findMany({ where: { carerId: userId, status: "active" } });
  return links.map((l) => l.userId);
}

/**
 * Appointments visible to the actor: their own plus those of people who
 * nominated them as an active carer. Elders and other members never see these.
 */
export async function visibleAppointments(actor: Actor, since?: Date) {
  const caring = await caredForIds(actor.user.id);
  const rows = await db.appointment.findMany({
    where: {
      patientLink: { status: "accepted", userId: { in: [actor.user.id, ...caring] } },
      ...(since ? { updatedAt: { gt: since } } : {}),
    },
    include: appointmentInclude,
    orderBy: { startsAt: "asc" },
  });
  return rows.map((a) => serializeAppointment(a, actor.user.id));
}

export function serializeAppointment(a: AppointmentRow, viewerId: string) {
  return {
    id: a.id,
    startsAt: a.startsAt,
    location: a.location,
    type: a.type,
    prepNotes: a.prepNotes,
    transportNote: a.transportNote,
    status: a.status,
    provider: {
      id: a.patientLink.provider.id,
      name: a.patientLink.provider.name,
      phone: a.patientLink.provider.phone,
    },
    personName: a.patientLink.user?.name ?? a.patientLink.displayName,
    isMine: a.patientLink.userId === viewerId,
    updatedAt: a.updatedAt,
  };
}

/** Patients confirm their own appointments; carers can confirm on their behalf. */
export async function confirmAppointment(actor: Actor, appointmentId: string) {
  const caring = await caredForIds(actor.user.id);
  const appt = await db.appointment.findFirst({
    where: {
      id: appointmentId,
      patientLink: { status: "accepted", userId: { in: [actor.user.id, ...caring] } },
    },
    include: appointmentInclude,
  });
  if (!appt) throw notFound("Appointment not found");
  if (appt.status === "booked") {
    const updated = await db.appointment.update({
      where: { id: appt.id },
      data: { status: "confirmed", confirmedAt: new Date() },
      include: appointmentInclude,
    });
    return serializeAppointment(updated, actor.user.id);
  }
  // Server wins: an already confirmed, cancelled or completed appointment is returned as-is.
  return serializeAppointment(appt, actor.user.id);
}

function timePhrase(at: Date, now = new Date()) {
  const day = (d: Date) => d.toLocaleDateString("en-AU", { timeZone: TZ });
  const time = at
    .toLocaleTimeString("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit" })
    .replace(":00", "")
    .replace(" ", "");
  const tomorrow = new Date(now.getTime() + 86400_000);
  if (day(at) === day(now)) return `today at ${time}`;
  if (day(at) === day(tomorrow)) return `tomorrow at ${time}`;
  const date = at.toLocaleDateString("en-AU", { timeZone: TZ, weekday: "long", day: "numeric", month: "short" });
  return `on ${date} at ${time}`;
}

/** Generic copy only: phones are shared, so never name the appointment type. */
export function reminderText(at: Date, recipient: "self" | "carer", now = new Date()) {
  const when = timePhrase(at, now);
  return recipient === "self"
    ? `You have an appointment ${when}. Open MyMob for details.`
    : `Someone you care for has an appointment ${when}. Open MyMob for details.`;
}

async function hasDevice(userId: string | null | undefined) {
  if (!userId) return false;
  return (await db.deviceProfile.count({ where: { userId, apnsToken: { not: null } } })) > 0;
}

/** Creates 48 h and 2 h reminders for the patient and each active carer. */
export async function scheduleReminders(appointmentId: string) {
  const appt = await db.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { patientLink: { include: { user: true } } },
  });
  await db.reminder.deleteMany({ where: { appointmentId, deliveryStatus: "scheduled" } });
  const patient = appt.patientLink.user;
  const carers = patient
    ? await db.carerLink.findMany({
        where: { userId: patient.id, status: "active" },
        include: { carer: true },
      })
    : [];
  const recipients = [
    {
      recipient: "self" as const,
      userId: patient?.id ?? null,
      phone: patient?.phoneNumber ?? appt.patientLink.invitedPhone,
      app: appt.patientLink.status === "accepted" && (await hasDevice(patient?.id)),
    },
    ...(await Promise.all(
      carers.map(async (c) => ({
        recipient: "carer" as const,
        userId: c.carerId,
        phone: c.carer.phoneNumber,
        app: await hasDevice(c.carerId),
      })),
    )),
  ];
  const now = Date.now();
  const rows = REMINDER_OFFSETS_H.flatMap((h) => {
    // A reminder whose window already passed at booking time is sent on the next run.
    const scheduledFor = new Date(Math.max(appt.startsAt.getTime() - h * 3600_000, now));
    if (appt.startsAt.getTime() <= now) return [];
    return recipients.map((r) => ({
      appointmentId,
      channel: r.app ? ("push" as const) : ("sms" as const),
      recipient: r.recipient,
      recipientUserId: r.userId,
      recipientPhone: r.phone,
      scheduledFor,
    }));
  });
  // Collapse duplicates when both windows have already passed.
  const unique = rows.filter(
    (r, i) =>
      rows.findIndex(
        (o) =>
          o.recipient === r.recipient &&
          o.recipientUserId === r.recipientUserId &&
          o.scheduledFor.getTime() === r.scheduledFor.getTime(),
      ) === i,
  );
  await db.reminder.createMany({ data: unique });
}

/** Sends every due reminder. Called by the cron route every 5 minutes. */
export async function dispatchDueReminders(now = new Date()) {
  const due = await db.reminder.findMany({
    where: { deliveryStatus: "scheduled", scheduledFor: { lte: now } },
    include: { appointment: { include: { patientLink: true } } },
    take: 200,
  });
  let sent = 0;
  for (const r of due) {
    const appt = r.appointment;
    const stillValid =
      ["booked", "confirmed"].includes(appt.status) &&
      appt.startsAt > now &&
      (r.recipient === "self" ||
        (await db.carerLink.count({
          where: { userId: appt.patientLink.userId ?? "", carerId: r.recipientUserId ?? "", status: "active" },
        })) > 0);
    if (!stillValid) {
      await db.reminder.update({ where: { id: r.id }, data: { deliveryStatus: "skipped" } });
      continue;
    }
    const text = reminderText(appt.startsAt, r.recipient, now);
    let channel = r.channel;
    let ok = false;
    if (channel === "push" && r.recipientUserId) {
      ok = await sendPush(r.recipientUserId, text, { kind: "appointment", appointmentId: appt.id });
    }
    if (!ok && r.recipientPhone) {
      // SMS fallback when there is no app install or push was not delivered.
      channel = "sms";
      ok = (await sendSms(r.recipientPhone, text)).ok;
    }
    await db.reminder.update({
      where: { id: r.id },
      data: { channel, sentAt: now, deliveryStatus: ok ? "sent" : "failed" },
    });
    if (ok) sent++;
  }
  return { due: due.length, sent };
}

/** Immediate notice to the patient when a clinic books, before the timed reminders. */
export async function notifyBooked(appointmentId: string) {
  const appt = await db.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { patientLink: { include: { user: true } } },
  });
  const link = appt.patientLink;
  const text = `You have a new appointment ${timePhrase(appt.startsAt)}. Open MyMob for details.`;
  if (link.status === "accepted" && link.userId) {
    if (await sendPush(link.userId, text, { kind: "appointment", appointmentId })) return "push";
  }
  await sendSms(link.user?.phoneNumber ?? link.invitedPhone, text);
  return "sms";
}

/** Rebuilds pending reminders after a carer is added or revoked. */
export async function rescheduleFor(userId: string) {
  const upcoming = await db.appointment.findMany({
    where: { patientLink: { userId }, status: { in: ["booked", "confirmed"] }, startsAt: { gt: new Date() } },
    select: { id: true },
  });
  for (const a of upcoming) await scheduleReminders(a.id);
}
