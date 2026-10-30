import type { CarerLink, User } from "@/generated/prisma/client";

export function serializeCarerLink(l: CarerLink & { carer: User; person: User }) {
  return {
    id: l.id,
    person: { id: l.person.id, name: l.person.name },
    carer: { id: l.carer.id, name: l.carer.name, phoneNumber: l.carer.phoneNumber },
    status: l.status,
    consentedAt: l.consentedAt,
    revokedAt: l.revokedAt,
  };
}
