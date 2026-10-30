"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/api";
import { normalisePhone } from "@/lib/auth";
import { db } from "@/lib/db";
import { formResult, requireWebActor } from "@/lib/web";

const done = () => revalidatePath("/admin", "layout");

/** In production a partner organisation (ACCHO, Land Council) verifies Elders. */
export async function nominationAction(form: FormData) {
  const actor = await requireWebActor("admin");
  const decision = z.enum(["verified", "rejected"]).parse(form.get("decision"));
  const n = await db.elderNomination.update({
    where: { id: String(form.get("id")) },
    data: { status: decision, verifiedBy: actor.user.id, decidedAt: new Date() },
  });
  if (decision === "verified") {
    await db.membership.update({ where: { userId_groupId: { userId: n.nomineeId, groupId: n.groupId } }, data: { role: "elder" } });
  }
  await audit(actor.user.id, `elder.${decision}`, "ElderNomination", n.id);
  done();
}

export async function verifyProviderAction(form: FormData) {
  const actor = await requireWebActor("admin");
  const p = await db.provider.update({ where: { id: String(form.get("id")) }, data: { verified: form.get("verified") === "true" } });
  await audit(actor.user.id, p.verified ? "provider.verify" : "provider.suspend", "Provider", p.id);
  done();
}

const providerInput = z.object({
  name: z.string().trim().min(2),
  type: z.string().trim().min(2),
  address: z.string().trim().min(2),
  lat: z.coerce.number().min(-45).max(-9),
  lng: z.coerce.number().min(110).max(155),
  staffPhone: z.string().trim().min(6),
  staffName: z.string().trim().min(2),
});

export async function onboardProviderAction(_: unknown, form: FormData) {
  return formResult(async () => {
    const actor = await requireWebActor("admin");
    const input = providerInput.parse(Object.fromEntries(form));
    const phone = normalisePhone(input.staffPhone);
    const provider = await db.provider.create({
      data: { name: input.name, type: input.type, address: input.address, lat: input.lat, lng: input.lng, verified: true },
    });
    const user =
      (await db.user.findUnique({ where: { phoneNumber: phone } })) ??
      (await db.user.create({
        data: { id: crypto.randomUUID(), name: input.staffName, phoneNumber: phone, phoneNumberVerified: false, email: `${phone.slice(1)}@phone.mymob.invalid` },
      }));
    await db.providerStaff.create({ data: { providerId: provider.id, userId: user.id } });
    await audit(actor.user.id, "provider.onboard", "Provider", provider.id);
    done();
  });
}
