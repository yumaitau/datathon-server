-- This migration is idempotent because fresh D1 databases receive these
-- tables from 0001, while the existing production database predates them.
CREATE TABLE IF NOT EXISTS "AuntySetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT,
    "groupId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "guidance" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuntySetting_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuntySetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AuntyThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuntyThread_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuntyThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AuntyMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT,
    "threadId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "handoff" TEXT,
    "mocked" BOOLEAN NOT NULL DEFAULT false,
    "clientMutationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuntyMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AuntyThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuntySetting_groupId_key" ON "AuntySetting"("groupId");
CREATE INDEX IF NOT EXISTS "AuntyThread_communityId_updatedAt_idx" ON "AuntyThread"("communityId", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AuntyThread_groupId_userId_key" ON "AuntyThread"("groupId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "AuntyMessage_clientMutationId_key" ON "AuntyMessage"("clientMutationId");
CREATE INDEX IF NOT EXISTS "AuntyMessage_threadId_createdAt_idx" ON "AuntyMessage"("threadId", "createdAt");
