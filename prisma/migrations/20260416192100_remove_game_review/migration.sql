/*
  Warnings:

  - The values [GAME_REVIEW] on the enum `LessonType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `gameReviewPricePer5Min` on the `User` table. All the data in the column will be lost.

*/
-- AlterEnum
-- First, convert any existing GAME_REVIEW records to LESSON
UPDATE "LessonRequest" SET "type" = 'LESSON' WHERE "type" = 'GAME_REVIEW';

BEGIN;
CREATE TYPE "LessonType_new" AS ENUM ('LESSON');
ALTER TABLE "LessonRequest" ALTER COLUMN "type" TYPE "LessonType_new" USING ("type"::text::"LessonType_new");
ALTER TYPE "LessonType" RENAME TO "LessonType_old";
ALTER TYPE "LessonType_new" RENAME TO "LessonType";
DROP TYPE "public"."LessonType_old";
COMMIT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "gameReviewPricePer5Min";
