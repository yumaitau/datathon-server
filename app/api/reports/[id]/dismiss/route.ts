import { type IdParams, requireActor, route } from "@/lib/api";
import { dismissReport } from "@/lib/governance";

/** Elder only: keep the comment and close the report. */
export const POST = route(async (_req, { params }: IdParams) => {
  const actor = await requireActor();
  const report = await dismissReport(actor, (await params).id);
  return { id: report.id, status: report.status };
});
