-- AlterTable
ALTER TABLE "User" ADD COLUMN "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: default all existing users to English
UPDATE "User" SET "languages" = ARRAY['en']::TEXT[];

-- CreateIndex
CREATE INDEX "User_languages_idx" ON "User" USING GIN ("languages");
