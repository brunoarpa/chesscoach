-- Coaches must give a reason when declining a pending lesson request. Stored
-- for admin review; purged with other free-text content after the retention
-- window (see purgeExpiredLessonData).
ALTER TABLE "LessonRequest" ADD COLUMN "declineReason" TEXT;
