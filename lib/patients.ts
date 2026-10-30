import type { PatientLink, Provider } from "@/generated/prisma/client";

export function serializeInvite(l: PatientLink & { provider: Provider }) {
  return {
    id: l.id,
    provider: { id: l.provider.id, name: l.provider.name, type: l.provider.type },
    status: l.status,
    createdAt: l.createdAt,
  };
}
