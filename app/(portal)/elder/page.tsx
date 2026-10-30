import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireWebActor } from "@/lib/web";

export default async function ElderHome() {
  const actor = await requireWebActor("elder");
  const first = await db.group.findFirst({
    where: { id: { in: [...actor.elderGroupIds] }, type: "community" },
    orderBy: { name: "asc" },
  });
  redirect(`/elder/${first?.id ?? [...actor.elderGroupIds][0]}`);
}
