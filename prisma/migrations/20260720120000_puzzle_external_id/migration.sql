-- AlterTable
ALTER TABLE "Puzzle" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Puzzle_externalId_key" ON "Puzzle"("externalId");
