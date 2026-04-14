-- CreateEnum
CREATE TYPE "CoachAvailability" AS ENUM ('AVAILABLE', 'BUSY', 'UNAVAILABLE');

-- AlterTable: Add new column with default
ALTER TABLE "User" ADD COLUMN "coachAvailability" "CoachAvailability" NOT NULL DEFAULT 'AVAILABLE';

-- Migrate data: map coachingEnabled to coachAvailability
UPDATE "User" SET "coachAvailability" = 'UNAVAILABLE' WHERE "coachingEnabled" = false;

-- DropColumn: Remove old boolean
ALTER TABLE "User" DROP COLUMN "coachingEnabled";
