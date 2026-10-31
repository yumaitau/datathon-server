-- CreateEnum
CREATE TYPE "AuntyAuthor" AS ENUM ('member', 'aunty');

-- CreateTable
CREATE TABLE "AuntySetting" (
    "id" TEXT NOT NULL,
    "communityId" TEXT,
    "groupId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "guidance" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuntySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuntyThread" (
    "id" TEXT NOT NULL,
    "communityId" TEXT,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuntyThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuntyMessage" (
    "id" TEXT NOT NULL,
    "communityId" TEXT,
    "threadId" TEXT NOT NULL,
    "author" "AuntyAuthor" NOT NULL,
    "body" TEXT NOT NULL,
    "handoff" TEXT,
    "mocked" BOOLEAN NOT NULL DEFAULT false,
    "clientMutationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuntyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuntySetting_groupId_key" ON "AuntySetting"("groupId");

-- CreateIndex
CREATE INDEX "AuntyThread_communityId_updatedAt_idx" ON "AuntyThread"("communityId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuntyThread_groupId_userId_key" ON "AuntyThread"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuntyMessage_clientMutationId_key" ON "AuntyMessage"("clientMutationId");

-- CreateIndex
CREATE INDEX "AuntyMessage_threadId_createdAt_idx" ON "AuntyMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuntySetting" ADD CONSTRAINT "AuntySetting_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuntySetting" ADD CONSTRAINT "AuntySetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuntyThread" ADD CONSTRAINT "AuntyThread_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuntyThread" ADD CONSTRAINT "AuntyThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuntyMessage" ADD CONSTRAINT "AuntyMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AuntyThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
