import { forbidden, route } from "@/lib/api";
import { dispatchDueReminders } from "@/lib/health";

/** Invoked every 5 minutes by the scheduler (EventBridge in AWS, the cron container locally). */
export const POST = route(async (req) => {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) throw forbidden();
  return dispatchDueReminders();
});
