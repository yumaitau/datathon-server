-- CreateEnum
CREATE TYPE "LanguageStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "TranslationStatus" AS ENUM ('draft', 'approved');

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "canTranslate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Language" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endonym" TEXT,
    "communityId" TEXT NOT NULL,
    "status" "LanguageStatus" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Translation" (
    "id" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "status" "TranslationStatus" NOT NULL DEFAULT 'draft',
    "updatedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Language_code_key" ON "Language"("code");

-- CreateIndex
CREATE INDEX "Language_communityId_idx" ON "Language"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "Translation_languageId_key_key" ON "Translation"("languageId", "key");

-- AddForeignKey
ALTER TABLE "Language" ADD CONSTRAINT "Language_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;
