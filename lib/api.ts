import { headers } from "next/headers";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { CommunityScopeError, db, scopedDb } from "@/lib/db";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "Sign in required");
export const forbidden = (msg = "Not allowed") => new HttpError(403, msg);
export const notFound = (what = "Not found") => new HttpError(404, what);

type Handler<C> = (req: Request, ctx: C) => Promise<unknown>;

/** Wraps a route handler: JSON-encodes results and maps errors to statuses. */
export function route<C>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      const result = await fn(req, ctx);
      return result instanceof Response ? result : Response.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return Response.json(
          { error: "Invalid request", issues: err.issues.map((i) => i.message) },
          { status: 400 },
        );
      }
      if (err instanceof CommunityScopeError) {
        return Response.json({ error: "Not allowed" }, { status: 403 });
      }
      console.error(err);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export function ageOf(dob: Date | null | undefined, at = new Date()) {
  if (!dob) return null;
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age--;
  return age;
}

async function loadActor(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      memberships: { where: { status: "active" }, include: { group: true } },
      staffOf: true,
    },
  });
  if (!user) return null;
  const communityIds = [
    ...new Set(user.memberships.map((m) => m.group.communityId).filter((c): c is string => !!c)),
  ];
  const elderGroupIds = new Set(
    user.memberships.filter((m) => m.role === "elder").map((m) => m.groupId),
  );
  return {
    user,
    age: ageOf(user.dateOfBirth),
    communityIds,
    elderGroupIds,
    providerIds: user.staffOf.map((s) => s.providerId),
    isAdmin: user.platformRole === "admin",
    db: scopedDb(communityIds),
  };
}

export type Actor = NonNullable<Awaited<ReturnType<typeof loadActor>>>;

/** Resolves the signed-in user from a bearer token (iOS) or cookie (web). */
export async function getActor(): Promise<Actor | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return loadActor(session.user.id);
}

export async function requireActor() {
  const actor = await getActor();
  if (!actor) throw unauthorized();
  return actor;
}

/** Elders of a community also govern its sub-groups. */
export async function isElderOf(actor: Actor, groupId: string) {
  if (actor.elderGroupIds.has(groupId)) return true;
  const group = await db.group.findUnique({ where: { id: groupId } });
  return !!group?.communityId && actor.elderGroupIds.has(group.communityId);
}

export async function requireElder(actor: Actor, groupId: string) {
  if (!(await isElderOf(actor, groupId))) throw forbidden("Elders only");
}

export function requireProviderStaff(actor: Actor, providerId?: string) {
  const id = providerId ?? actor.providerIds[0];
  if (!id || !actor.providerIds.includes(id)) throw forbidden("Provider staff only");
  return id;
}

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId?: string,
  detail?: string,
) {
  await db.auditLog.create({ data: { actorId, action, entity, entityId, detail } });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export type IdParams = { params: Promise<{ id: string }> };
