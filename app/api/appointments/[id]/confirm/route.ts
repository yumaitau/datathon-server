import { type IdParams, requireActor, route } from "@/lib/api";
import { confirmAppointment } from "@/lib/health";

export const POST = route(async (_req, { params }: IdParams) => {
  const actor = await requireActor();
  return confirmAppointment(actor, (await params).id);
});
