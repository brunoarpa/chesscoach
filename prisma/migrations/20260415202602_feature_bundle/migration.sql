/*
  Warnings:

  - You are about to drop the column `coachPricePerHour` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `gameReviewPrice` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "LessonCommunicationMethod" AS ENUM ('CALL', 'CHAT');

-- AlterEnum
ALTER TYPE "LessonRequestStatus" ADD VALUE 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "LessonRequest" ADD COLUMN     "coachStartConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "communicationMethod" "LessonCommunicationMethod",
ADD COLUMN     "message" TEXT,
ADD COLUMN     "studentStartConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "coachPricePerHour",
DROP COLUMN "gameReviewPrice",
ADD COLUMN     "coachPricePer5Min" INTEGER,
ADD COLUMN     "gameReviewPricePer5Min" INTEGER;

-- CreateTable
CREATE TABLE "Favourite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favourite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Favourite_userId_idx" ON "Favourite"("userId");

-- CreateIndex
CREATE INDEX "Favourite_coachId_idx" ON "Favourite"("coachId");

-- CreateIndex
CREATE UNIQUE INDEX "Favourite_userId_coachId_key" ON "Favourite"("userId", "coachId");

-- CreateIndex
CREATE INDEX "Block_coachId_idx" ON "Block"("coachId");

-- CreateIndex
CREATE INDEX "Block_studentId_idx" ON "Block"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Block_coachId_studentId_key" ON "Block"("coachId", "studentId");

-- AddForeignKey
ALTER TABLE "Favourite" ADD CONSTRAINT "Favourite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favourite" ADD CONSTRAINT "Favourite_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
