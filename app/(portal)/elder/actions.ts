"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, requireElder } from "@/lib/api";
import { db } from "@/lib/db";
import { decideMembership, decideProviderAccess, dismissReport, hideComment, moderatePost } from "@/lib/governance";
import { formResult, requireWebActor } from "@/lib/web";

const done = () => revalidatePath("/elder", "layout");

export async function membershipAction(form: FormData) {
  const actor = await requireWebActor("elder");
  const action = z.enum(["approve", "reject", "remove"]).parse(form.get("action"));
  await decideMembership(actor, String(form.get("id")), action);
  done();
}

export async function postAction(form: FormData) {
  const actor = await requireWebActor("elder");
  const action = z.enum(["approve", "reject", "pin", "unpin"]).parse(form.get("action"));
  const id = String(form.get("id"));
  if (action === "approve") await moderatePost(actor, id, "approve", { pinned: form.get("pin") === "on" });
  else if (action === "reject") await moderatePost(actor, id, "reject");
  else await moderatePost(actor, id, "pin", { pinned: action === "pin" });
  done();
}

export async function providerAction(form: FormData) {
  const actor = await requireWebActor("elder");
  const decision = z.enum(["approved", "rejected"]).parse(form.get("decision"));
  await decideProviderAccess(actor, String(form.get("id")), decision);
  done();
}

export async function reportAction(form: FormData) {
  const actor = await requireWebActor("elder");
  if (form.get("action") === "hide") await hideComment(actor, String(form.get("commentId")));
  else await dismissReport(actor, String(form.get("id")));
  done();
}

/**
 * Elders switch the AI Aunty on for their group and write the brief she works
 * to. They never get a route to anyone's conversation — only to the voice.
 */
export async function auntyAction(form: FormData) {
  const actor = await requireWebActor("elder");
  const groupId = String(form.get("groupId"));
  await requireElder(actor, groupId);
  const enabled = form.get("enabled") === "on";
  const guidance = String(form.get("guidance") ?? "").trim().slice(0, 2000);
  const group = await db.group.findUniqueOrThrow({ where: { id: groupId } });

  await db.auntySetting.upsert({
    where: { groupId },
    create: {
      groupId,
      communityId: group.communityId,
      enabled,
      guidance: guidance || null,
      updatedById: actor.user.id,
    },
    update: { enabled, guidance: guidance || null, updatedById: actor.user.id },
  });
  await audit(actor.user.id, enabled ? "aunty.enable" : "aunty.disable", "Group", groupId);
  done();
}

export async function nominateAction(_: unknown, form: FormData) {
  return formResult(async () => {
    const actor = await requireWebActor("elder");
    const groupId = String(form.get("groupId"));
    await requireElder(actor, groupId);
    const nomineeId = String(form.get("nomineeId"));
    const member = await db.membership.findUnique({ where: { userId_groupId: { userId: nomineeId, groupId } } });
    if (member?.status !== "active") throw Object.assign(new Error("Pick an active member"), { status: 400 });
    const n = await db.elderNomination.create({
      data: { groupId, communityId: groupId, nomineeId, nominatedBy: actor.user.id },
    });
    await audit(actor.user.id, "elder.nominate", "ElderNomination", n.id);
    done();
  });
}
