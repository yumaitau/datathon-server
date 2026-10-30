"use server";

import { revalidatePath } from "next/cache";
import { dispatchDueReminders } from "@/lib/health";
import {
  bookAppointment,
  bookInput,
  invitePatient,
  inviteInput,
  postProviderEvent,
  providerEventInput,
  requestGroupAccess,
  updateAppointment,
} from "@/lib/provider";
import { parseLocalDateTime } from "@/lib/time";
import { formResult, requireWebActor } from "@/lib/web";

const done = () => revalidatePath("/provider", "layout");
const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

export async function inviteAction(_: unknown, form: FormData) {
  return formResult(async () => {
    const actor = await requireWebActor("provider");
    await invitePatient(actor, inviteInput.parse({ phoneNumber: text(form, "phoneNumber"), displayName: text(form, "displayName") }));
    done();
  });
}

export async function bookAction(_: unknown, form: FormData) {
  return formResult(async () => {
    const actor = await requireWebActor("provider");
    await bookAppointment(
      actor,
      bookInput.parse({
        patientLinkId: text(form, "patientLinkId"),
        startsAt: parseLocalDateTime(text(form, "startsAt") ?? ""),
        type: text(form, "type"),
        location: text(form, "location"),
        prepNotes: text(form, "prepNotes"),
        transportNote: text(form, "transportNote"),
      }),
    );
    done();
  });
}

export async function statusAction(form: FormData) {
  const actor = await requireWebActor("provider");
  const status = text(form, "status") as "attended" | "missed" | "cancelled";
  await updateAppointment(actor, String(form.get("id")), { status });
  done();
}

export async function requestAccessAction(form: FormData) {
  const actor = await requireWebActor("provider");
  await requestGroupAccess(actor, String(form.get("groupId")), text(form, "message"));
  done();
}

export async function providerEventAction(_: unknown, form: FormData) {
  return formResult(async () => {
    const actor = await requireWebActor("provider");
    await postProviderEvent(
      actor,
      providerEventInput.parse({
        groupId: text(form, "groupId"),
        title: text(form, "title"),
        description: text(form, "description"),
        startsAt: parseLocalDateTime(text(form, "startsAt") ?? ""),
        location: text(form, "location"),
      }),
    );
    done();
  });
}

/** Demo control: run the 5-minute reminder job now instead of waiting. */
export async function runRemindersAction() {
  await requireWebActor("provider");
  await dispatchDueReminders();
  revalidatePath("/", "layout");
}
