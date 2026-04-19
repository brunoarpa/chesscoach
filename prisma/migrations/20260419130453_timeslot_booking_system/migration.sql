/*
  Warnings:

  - The values [BUSY] on the enum `CoachAvailability` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `coachPricePer5Min` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `passwordHash` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `resetToken` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `resetTokenExpiry` on the `User` table. All the data in the column will be lost.
  - Made the column `email` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "TimeSlotStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'UNAVAILABLE');

-- Fix NULL emails before making column required (use username@placeholder.local for existing users)
UPDATE "User" SET "email" = "username" || '@placeholder.local' WHERE "email" IS NULL;

-- Fix BUSY coach availability before removing enum value
UPDATE "User" SET "coachAvailability" = 'UNAVAILABLE' WHERE "coachAvailability" = 'BUSY';

-- AlterEnum
BEGIN;
CREATE TYPE "CoachAvailability_new" AS ENUM ('AVAILABLE', 'UNAVAILABLE');
ALTER TABLE "public"."User" ALTER COLUMN "coachAvailability" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "coachAvailability" TYPE "CoachAvailability_new" USING ("coachAvailability"::text::"CoachAvailability_new");
ALTER TYPE "CoachAvailability" RENAME TO "CoachAvailability_old";
ALTER TYPE "CoachAvailability_new" RENAME TO "CoachAvailability";
DROP TYPE "public"."CoachAvailability_old";
ALTER TABLE "User" ALTER COLUMN "coachAvailability" SET DEFAULT 'AVAILABLE';
COMMIT;

-- AlterEnum
ALTER TYPE "LessonRequestStatus" ADD VALUE 'NO_SHOW';

-- DropIndex
DROP INDEX "User_resetToken_idx";

-- AlterTable
ALTER TABLE "LessonRequest" ADD COLUMN     "acceptanceDeadline" TIMESTAMP(3),
ADD COLUMN     "coachJoinedAt" TIMESTAMP(3),
ADD COLUMN     "scheduledEndAt" TIMESTAMP(3),
ADD COLUMN     "scheduledStartAt" TIMESTAMP(3),
ADD COLUMN     "studentJoinedAt" TIMESTAMP(3),
ADD COLUMN     "timeSlotId" TEXT,
ALTER COLUMN "durationMinutes" SET DEFAULT 15;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "coachPricePer5Min",
DROP COLUMN "passwordHash",
DROP COLUMN "resetToken",
DROP COLUMN "resetTokenExpiry",
ADD COLUMN     "coachCallPrice" INTEGER,
ADD COLUMN     "coachChatPrice" INTEGER,
ADD COLUMN     "coachRatingPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "emailVerified" TIMESTAMP(3),
ADD COLUMN     "image" TEXT,
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "verificationCode" TEXT,
ALTER COLUMN "username" DROP NOT NULL,
ALTER COLUMN "email" SET NOT NULL;

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSlotTemplate" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeSlotTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSlot" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "templateId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "TimeSlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "lessonRequestId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "TimeSlotTemplate_coachId_idx" ON "TimeSlotTemplate"("coachId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeSlotTemplate_coachId_dayOfWeek_startHour_startMinute_key" ON "TimeSlotTemplate"("coachId", "dayOfWeek", "startHour", "startMinute");

-- CreateIndex
CREATE INDEX "TimeSlot_coachId_idx" ON "TimeSlot"("coachId");

-- CreateIndex
CREATE INDEX "TimeSlot_startTime_idx" ON "TimeSlot"("startTime");

-- CreateIndex
CREATE INDEX "TimeSlot_status_idx" ON "TimeSlot"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TimeSlot_coachId_startTime_key" ON "TimeSlot"("coachId", "startTime");

-- CreateIndex
CREATE INDEX "ChatMessage_lessonRequestId_idx" ON "ChatMessage"("lessonRequestId");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "LessonRequest_timeSlotId_idx" ON "LessonRequest"("timeSlotId");

-- CreateIndex
CREATE INDEX "LessonRequest_scheduledStartAt_idx" ON "LessonRequest"("scheduledStartAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonRequest" ADD CONSTRAINT "LessonRequest_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlotTemplate" ADD CONSTRAINT "TimeSlotTemplate_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TimeSlotTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_lessonRequestId_fkey" FOREIGN KEY ("lessonRequestId") REFERENCES "LessonRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
