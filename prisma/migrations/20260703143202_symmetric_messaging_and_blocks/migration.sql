-- Generalize Block: coach->student becomes a symmetric blocker/blocked pair.
ALTER TABLE "Block" RENAME COLUMN "coachId" TO "blockerId";
ALTER TABLE "Block" RENAME COLUMN "studentId" TO "blockedId";
ALTER INDEX "Block_coachId_studentId_key" RENAME TO "Block_blockerId_blockedId_key";
ALTER INDEX "Block_coachId_idx" RENAME TO "Block_blockerId_idx";
ALTER INDEX "Block_studentId_idx" RENAME TO "Block_blockedId_idx";
ALTER TABLE "Block" RENAME CONSTRAINT "Block_coachId_fkey" TO "Block_blockerId_fkey";
ALTER TABLE "Block" RENAME CONSTRAINT "Block_studentId_fkey" TO "Block_blockedId_fkey";

-- Conversation: any-two-users, symmetric participants; drop the per-thread mute
-- (blocking now lives entirely in the Block model).
ALTER TABLE "Conversation" RENAME COLUMN "coachId" TO "participantAId";
ALTER TABLE "Conversation" RENAME COLUMN "studentId" TO "participantBId";
ALTER TABLE "Conversation" DROP COLUMN "blockedByStudentAt";
ALTER INDEX "Conversation_coachId_studentId_key" RENAME TO "Conversation_participantAId_participantBId_key";
ALTER INDEX "Conversation_coachId_idx" RENAME TO "Conversation_participantAId_idx";
ALTER INDEX "Conversation_studentId_idx" RENAME TO "Conversation_participantBId_idx";
ALTER TABLE "Conversation" RENAME CONSTRAINT "Conversation_coachId_fkey" TO "Conversation_participantAId_fkey";
ALTER TABLE "Conversation" RENAME CONSTRAINT "Conversation_studentId_fkey" TO "Conversation_participantBId_fkey";

-- Canonicalize existing rows so participantAId < participantBId.
UPDATE "Conversation"
  SET ("participantAId", "participantBId") = ("participantBId", "participantAId")
  WHERE "participantAId" > "participantBId";
