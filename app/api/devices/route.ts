import { z } from "zod";
import { readJson, requireActor, route } from "@/lib/api";
import { db } from "@/lib/db";

const input = z.object({ deviceId: z.string().min(1).max(100), apnsToken: z.string().max(200).optional().nullable() });

/** Registers this profile on a device. One device can hold several profiles (shared phones). */
export const POST = route(async (req) => {
  const actor = await requireActor();
  const { deviceId, apnsToken } = input.parse(await readJson(req));
  await db.deviceProfile.upsert({
    where: { userId_deviceId: { userId: actor.user.id, deviceId } },
    create: { userId: actor.user.id, deviceId, apnsToken },
    update: { apnsToken },
  });
  return { ok: true };
});
