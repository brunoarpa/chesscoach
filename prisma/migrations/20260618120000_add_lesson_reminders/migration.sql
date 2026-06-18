-- Reminder email bookkeeping for scheduled lessons: timestamps marking when the
-- 1-day-before and 1-hour-before reminders were sent, so the sweep never
-- double-sends.
ALTER TABLE "LessonRequest" ADD COLUMN "reminderDayBeforeSentAt" TIMESTAMP(3);
ALTER TABLE "LessonRequest" ADD COLUMN "reminderHourBeforeSentAt" TIMESTAMP(3);
