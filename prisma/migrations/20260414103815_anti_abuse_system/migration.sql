-- CreateEnum
CREATE TYPE "AbuseFlagType" AS ENUM ('DUPLICATE_CARD', 'CONFIRMATION_TIMEOUT', 'ONE_SIDED_CONFIRMATION', 'COACH_NON_RESPONSIVE', 'STUDENT_SPAM', 'MULTI_ACCOUNT_SUSPECTED');

-- CreateEnum
CREATE TYPE "AbuseFlagSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "LessonRequest" ADD COLUMN     "isTrial" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "freeTrialsRemaining" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "isSuspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signupIp" TEXT,
ALTER COLUMN "coachElo" SET DEFAULT 1000;

-- CreateTable
CREATE TABLE "CardFingerprint" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "last4" TEXT,
    "brand" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbuseFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AbuseFlagType" NOT NULL,
    "severity" "AbuseFlagSeverity" NOT NULL,
    "details" TEXT NOT NULL,
    "relatedLessonId" TEXT,
    "relatedUserId" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbuseFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardFingerprint_fingerprint_idx" ON "CardFingerprint"("fingerprint");

-- CreateIndex
CREATE INDEX "CardFingerprint_userId_idx" ON "CardFingerprint"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardFingerprint_fingerprint_userId_key" ON "CardFingerprint"("fingerprint", "userId");

-- CreateIndex
CREATE INDEX "AbuseFlag_userId_idx" ON "AbuseFlag"("userId");

-- CreateIndex
CREATE INDEX "AbuseFlag_resolved_idx" ON "AbuseFlag"("resolved");

-- CreateIndex
CREATE INDEX "AbuseFlag_type_idx" ON "AbuseFlag"("type");

-- CreateIndex
CREATE INDEX "AbuseFlag_createdAt_idx" ON "AbuseFlag"("createdAt");

-- AddForeignKey
ALTER TABLE "CardFingerprint" ADD CONSTRAINT "CardFingerprint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbuseFlag" ADD CONSTRAINT "AbuseFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbuseFlag" ADD CONSTRAINT "AbuseFlag_relatedLessonId_fkey" FOREIGN KEY ("relatedLessonId") REFERENCES "LessonRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbuseFlag" ADD CONSTRAINT "AbuseFlag_relatedUserId_fkey" FOREIGN KEY ("relatedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
