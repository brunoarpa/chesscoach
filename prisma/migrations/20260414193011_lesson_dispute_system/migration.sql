-- AlterEnum
ALTER TYPE "AbuseFlagType" ADD VALUE 'LESSON_DISPUTE';

-- AlterEnum
ALTER TYPE "LessonRequestStatus" ADD VALUE 'DISPUTED';

-- AlterTable
ALTER TABLE "LessonRequest" ADD COLUMN     "disputeReason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hasActiveDispute" BOOLEAN NOT NULL DEFAULT false;
