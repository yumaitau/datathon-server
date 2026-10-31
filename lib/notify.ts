import { createSign } from "node:crypto";
import http2 from "node:http2";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { awsClientConfig } from "@/lib/aws";
import { db } from "@/lib/db";

// Real delivery is used when credentials are configured; otherwise messages are
// recorded in NotificationLog, which the admin outbox page shows during demos.

export type SendResult = { ok: boolean; provider: string; error?: string };

let sns: SNSClient | undefined;

export async function sendSms(to: string, body: string): Promise<SendResult> {
  let result: SendResult;
  if (process.env.SNS_ENABLED === "true") {
    sns ??= new SNSClient(awsClientConfig());
    try {
      await sns.send(
        new PublishCommand({
          PhoneNumber: to,
          Message: body,
          MessageAttributes: {
            "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
            ...(process.env.SNS_SENDER_ID
              ? {
                  "AWS.SNS.SMS.SenderID": {
                    DataType: "String",
                    StringValue: process.env.SNS_SENDER_ID,
                  },
                }
              : {}),
          },
        }),
      );
      result = { ok: true, provider: "sns" };
    } catch (err) {
      result = { ok: false, provider: "sns", error: (err as Error).message };
    }
  } else {
    console.info(`[sms outbox] ${to}: ${body}`);
    result = { ok: true, provider: "outbox" };
  }
  await db.notificationLog.create({
    data: {
      channel: "sms",
      to,
      body,
      provider: result.provider,
      status: result.ok ? "sent" : "failed",
      error: result.error,
    },
  });
  return result;
}

let apnsJwt: { token: string; issuedAt: number } | undefined;

function apnsToken() {
  const now = Math.floor(Date.now() / 1000);
  // APNs accepts a provider token for up to an hour; refresh every 50 minutes.
  if (apnsJwt && now - apnsJwt.issuedAt < 3000) return apnsJwt.token;
  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID }),
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: now }),
  ).toString("base64url");
  const signer = createSign("SHA256");
  signer.update(`${header}.${claims}`);
  const key = (process.env.APNS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const sig = signer.sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  apnsJwt = { token: `${header}.${claims}.${sig}`, issuedAt: now };
  return apnsJwt.token;
}

function apnsConfigured() {
  return Boolean(
    process.env.APNS_KEY_ID &&
      process.env.APNS_TEAM_ID &&
      process.env.APNS_PRIVATE_KEY &&
      process.env.APNS_BUNDLE_ID,
  );
}

async function deliverApns(deviceToken: string, payload: object): Promise<SendResult> {
  const host =
    process.env.APNS_PRODUCTION === "true"
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com";
  return new Promise((resolve) => {
    const client = http2.connect(host);
    client.on("error", (err) => resolve({ ok: false, provider: "apns", error: err.message }));
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${apnsToken()}`,
      "apns-topic": process.env.APNS_BUNDLE_ID!,
      "apns-push-type": "alert",
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      client.close();
      resolve(
        status === 200
          ? { ok: true, provider: "apns" }
          : { ok: false, provider: "apns", error: `${status} ${body}` },
      );
    });
    req.end(JSON.stringify(payload));
  });
}

/**
 * Push to every device registered for `userId`. Text must stay generic because
 * phones are shared: never include the appointment type or clinical detail.
 * Returns false when the user has no device or no delivery succeeded, so the
 * caller can fall back to SMS.
 */
export async function sendPush(
  userId: string,
  body: string,
  data: Record<string, string> = {},
): Promise<boolean> {
  const devices = await db.deviceProfile.findMany({
    where: { userId, apnsToken: { not: null } },
  });
  if (devices.length === 0) return false;
  const payload = { aps: { alert: { title: "MyMob", body }, sound: "default" }, ...data };
  let delivered = false;
  for (const device of devices) {
    const result = apnsConfigured()
      ? await deliverApns(device.apnsToken!, payload)
      : { ok: true, provider: "outbox" };
    delivered ||= result.ok;
    await db.notificationLog.create({
      data: {
        channel: "push",
        to: `${userId}/${device.deviceId}`,
        body,
        provider: result.provider,
        status: result.ok ? "sent" : "failed",
        error: "error" in result ? result.error : undefined,
      },
    });
  }
  return delivered;
}
