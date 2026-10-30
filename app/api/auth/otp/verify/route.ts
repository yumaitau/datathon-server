import { z } from "zod";
import { HttpError, readJson, route } from "@/lib/api";
import { auth, normalisePhone } from "@/lib/auth";
import { db } from "@/lib/db";

const input = z.object({
  phoneNumber: z.string().min(6),
  code: z.string().min(4).max(8),
  name: z.string().trim().min(1).max(80).optional(),
});

/** Verifies the SMS code and returns a bearer token for the iOS app. */
export const POST = route(async (req) => {
  const body = input.parse(await readJson(req));
  const phoneNumber = normalisePhone(body.phoneNumber);
  let result;
  try {
    result = await auth.api.verifyPhoneNumber({ body: { phoneNumber, code: body.code } });
  } catch {
    throw new HttpError(400, "That code didn't work. Check it and try again.");
  }
  if (!result?.token) throw new HttpError(400, "That code didn't work. Check it and try again.");
  let user = await db.user.findUniqueOrThrow({ where: { id: result.user.id } });
  if (body.name && user.name === "New member") {
    user = await db.user.update({ where: { id: user.id }, data: { name: body.name } });
  }
  // Clinic invites are addressed to a phone number; attach them now the owner has signed in.
  await db.patientLink.updateMany({
    where: { invitedPhone: phoneNumber, userId: null },
    data: { userId: user.id },
  });
  return {
    token: result.token,
    user: {
      id: user.id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
    },
  };
});
