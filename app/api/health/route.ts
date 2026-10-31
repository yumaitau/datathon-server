import { db } from "@/lib/db";

/** Liveness + database check for Docker and load balancers. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Database health check failed", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
