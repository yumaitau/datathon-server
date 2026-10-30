import { requireActor, route } from "@/lib/api";
import { visibleAppointments } from "@/lib/health";

export const GET = route(async () => {
  const actor = await requireActor();
  const all = await visibleAppointments(actor);
  return { mine: all.filter((a) => a.isMine), caring: all.filter((a) => !a.isMine) };
});
