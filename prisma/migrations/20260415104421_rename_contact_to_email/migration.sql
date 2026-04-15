/*
  Warnings:

  - You are about to drop the column `contactInfo` on the `RecoveryRequest` table. All the data in the column will be lost.
  - Added the required column `email` to the `RecoveryRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RecoveryRequest" RENAME COLUMN "contactInfo" TO "email";
