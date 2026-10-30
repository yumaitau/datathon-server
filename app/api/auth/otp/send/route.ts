import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { auth, normalisePhone } from "@/lib/auth";

const input = z.object({ phoneNumber: z.string().min(6) });

export const POST = route(async (req) => {
  const { phoneNumber } = input.parse(await readJson(req));
  await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: normalisePhone(phoneNumber) } });
  return { ok: true };
});
