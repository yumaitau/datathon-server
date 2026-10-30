import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { bearer, phoneNumber } from "better-auth/plugins";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/notify";

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
/** Seeded demo numbers (+61 400 000 0xx) also accept DEMO_OTP_CODE. */
const DEMO_NUMBER = /^\+614000000\d\d$/;

const hashCode = (phone: string, code: string) =>
  createHash("sha256").update(`${phone}:${code}:${process.env.BETTER_AUTH_SECRET}`).digest();

export function normalisePhone(input: string) {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("04")) return `+61${digits.slice(1)}`;
  if (digits.startsWith("61")) return `+${digits}`;
  return digits;
}

export async function issueOtp(phone: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.otpCode.create({
    data: {
      phoneNumber: phone,
      codeHash: hashCode(phone, code).toString("hex"),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  await sendSms(phone, `Your MyMob code is ${code}. It expires in 5 minutes.`);
}

export async function checkOtp(phone: string, code: string) {
  const demo = process.env.DEMO_OTP_CODE;
  if (demo && DEMO_NUMBER.test(phone) && code === demo) return true;

  const otp = await db.otpCode.findFirst({
    where: { phoneNumber: phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) return false;
  const ok = timingSafeEqual(Buffer.from(otp.codeHash, "hex"), hashCode(phone, code));
  await db.otpCode.update({
    where: { id: otp.id },
    data: ok ? { consumedAt: new Date() } : { attempts: { increment: 1 } },
  });
  return ok;
}

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  session: { expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24 },
  user: {
    additionalFields: {
      platformRole: { type: "string", input: false, required: false },
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: ({ phoneNumber }) => issueOtp(phoneNumber),
      verifyOTP: ({ phoneNumber, code }) => checkOtp(phoneNumber, code),
      signUpOnVerification: {
        getTempEmail: (phone) => `${phone.replace("+", "")}@phone.mymob.invalid`,
        getTempName: () => "New member",
      },
    }),
    bearer(),
    nextCookies(),
  ],
});
