import { requireActor, route } from "@/lib/api";
import { db } from "@/lib/db";

/** Service directory (clinics, legal, housing, transport). Small enough to cache offline. */
export const GET = route(async () => {
  await requireActor();
  const providers = await db.provider.findMany({ where: { verified: true }, orderBy: [{ type: "asc" }, { name: "asc" }] });
  return providers.map((p) => ({ id: p.id, name: p.name, type: p.type, address: p.address, phone: p.phone, lat: p.lat, lng: p.lng }));
});
