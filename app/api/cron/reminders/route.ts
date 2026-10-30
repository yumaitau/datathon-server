import { forbidden, route } from "@/lib/api";
import { db } from "@/lib/db";
import { dispatchDueReminders } from "@/lib/health";

const SORRY_BUSINESS_DAYS = 14;

/** Invoked every 5 minutes by the scheduler (EventBridge in AWS, the cron container locally). */
export const POST = route(async (req) => {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) throw forbidden();
  const reminders = await dispatchDueReminders();
  // Sorry business notices auto-archive so they don't linger in the feed.
  const archived = await db.post.updateMany({
    where: { kind: "sorry_business", archivedAt: null, createdAt: { lt: new Date(Date.now() - SORRY_BUSINESS_DAYS * 86400_000) } },
    data: { archivedAt: new Date() },
  });
  return { ...reminders, archivedSorryBusiness: archived.count };
});
