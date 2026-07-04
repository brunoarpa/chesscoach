-- DropIndex
DROP INDEX "User_continent_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "continent";

-- DropEnum
DROP TYPE "Continent";
