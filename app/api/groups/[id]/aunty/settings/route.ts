import { z } from "zod";
import { audit, type IdParams, readJson, requireActor, requireElder, route } from "@/lib/api";
import { db } from "@/lib/db";

const input = z.object({
  enabled: z.boolean(),
  guidance: z.string().trim().max(2000).nullable().optional(),
});

/** Elders of the group decide whether it has an Aunty and what she is told. */
export const PUT = route(async (req, { params }: IdParams) => {
  const actor = await requireActor();
  const groupId = (await params).id;
  await requireElder(actor, groupId);

  const { enabled, guidance } = input.parse(await readJson(req));
  const group = await db.group.findUniqueOrThrow({ where: { id: groupId } });

  const setting = await db.auntySetting.upsert({
    where: { groupId },
    create: {
      groupId,
      communityId: group.communityId,
      enabled,
      guidance: guidance ?? null,
      updatedById: actor.user.id,
    },
    update: { enabled, guidance: guidance ?? null, updatedById: actor.user.id },
  });

  await audit(actor.user.id, enabled ? "aunty.enable" : "aunty.disable", "Group", groupId);
  return { enabled: setting.enabled, guidance: setting.guidance };
});
