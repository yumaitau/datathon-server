import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as D1PrismaClient } from "@/generated/prisma-d1/client";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const isD1 = process.env.DATABASE_PROVIDER === "d1";
export const databaseProvider = isD1 ? "sqlite" : "postgresql";

function createClient() {
  if (isD1) {
    const { DB } = getCloudflareContext().env as CloudflareEnv & {
      DB: ConstructorParameters<typeof PrismaD1>[0];
    };
    // Both generated clients come from the same models. The second client only
    // changes Prisma's SQL connector from PostgreSQL to D1's SQLite dialect.
    return new D1PrismaClient({ adapter: new PrismaD1(DB) }) as unknown as PrismaClient;
  }
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

let client: PrismaClient | undefined;
function getClient() {
  return (client ??= createClient());
}

// D1 bindings exist only once OpenNext enters a request context. Deferring
// construction also prevents Next.js build-time module analysis from opening a
// database connection.
const lazyClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const activeClient = getClient();
    const value = Reflect.get(activeClient, property, activeClient);
    return typeof value === "function" ? value.bind(activeClient) : value;
  },
});

/** Unscoped client. Use for auth, cross-community lookups and platform admin. */
export const db = globalForPrisma.prisma ?? lazyClient;
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/**
 * Models that hold community-owned content. Queries through `scopedDb` on these
 * models are filtered to the caller's communities, and creates must target one
 * of them, so one community's data is never returned to another.
 */
const SCOPED_MODELS = new Set([
  "Post",
  "Event",
  "Rsvp",
  "Comment",
  "Reaction",
  "Report",
  "AuntySetting",
  "AuntyThread",
  "AuntyMessage",
]);

const FILTERED_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

export class CommunityScopeError extends Error {
  constructor(model: string) {
    super(`Write to ${model} outside the caller's communities`);
  }
}

export function scopedDb(communityIds: string[]) {
  const allowed = new Set(communityIds);
  return db.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as Record<string, unknown>;
          if (FILTERED_OPS.has(operation)) {
            const where = (a.where ?? {}) as Record<string, unknown>;
            a.where = { ...where, communityId: { in: [...allowed] } };
          }
          if (operation === "create" || operation === "upsert") {
            const data = (operation === "create" ? a.data : a.create) as
              | { communityId?: string | null }
              | undefined;
            if (!data?.communityId || !allowed.has(data.communityId)) {
              throw new CommunityScopeError(model);
            }
          }
          if (operation === "createMany") {
            const rows = ([] as { communityId?: string | null }[]).concat(
              (a.data as never) ?? [],
            );
            if (rows.some((r) => !r.communityId || !allowed.has(r.communityId))) {
              throw new CommunityScopeError(model);
            }
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scopedDb>;
