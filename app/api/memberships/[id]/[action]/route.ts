import { notFound, requireActor, route } from "@/lib/api";
import { type MembershipAction, decideMembership } from "@/lib/governance";

const ACTIONS = new Set<MembershipAction>(["approve", "reject", "remove"]);

export const POST = route(async (_req, { params }: { params: Promise<{ id: string; action: string }> }) => {
  const actor = await requireActor();
  const { id, action } = await params;
  if (!ACTIONS.has(action as MembershipAction)) throw notFound();
  const m = await decideMembership(actor, id, action as MembershipAction);
  return { id: m.id, status: m.status };
});
