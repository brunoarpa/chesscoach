-- Lessons move from 15-minute to 30-minute slots.
--
-- Availability is preserved (not wiped) by deriving the new 30-min schedule from
-- the old 15-min one: slots/templates that start on the half hour (:00 / :30)
-- survive and become 30-min lessons; quarter-hour starts (:15 / :45) can't anchor
-- a 30-min lesson without overlapping the next one, so they are dropped. A coach
-- who had full-hour coverage (:00 :15 :30 :45) keeps the same hours, now as two
-- 30-min slots per hour instead of four 15-min ones.

-- 1. Drop future, unbooked concrete slots that started on a quarter hour. Booked
--    slots (referenced by a lesson request) are left untouched so in-flight
--    lessons keep their original time.
DELETE FROM "TimeSlot" ts
USING "TimeSlotTemplate" t
WHERE ts."templateId" = t.id
  AND t."startMinute" IN (15, 45)
  AND ts."startTime" > now()
  AND ts."status" IN ('AVAILABLE', 'UNAVAILABLE')
  AND NOT EXISTS (
    SELECT 1 FROM "LessonRequest" lr WHERE lr."timeSlotId" = ts.id
  );

-- 2. Extend the surviving future, unbooked slots from 15 to 30 minutes in place,
--    so coaches keep their availability without a regeneration gap. (:00 -> :00-:30,
--    :30 -> :30-:00; these tile the hour and never overlap.)
UPDATE "TimeSlot"
SET "endTime" = "startTime" + INTERVAL '30 minutes'
WHERE "startTime" > now()
  AND "status" IN ('AVAILABLE', 'UNAVAILABLE');

-- 3. Drop the quarter-hour weekly templates. The templateId on any remaining slot
--    that referenced one is set null automatically (optional relation).
DELETE FROM "TimeSlotTemplate" WHERE "startMinute" IN (15, 45);

-- 4. New lessons default to 30 minutes (code always sets this explicitly; the
--    default just keeps the schema honest).
ALTER TABLE "LessonRequest" ALTER COLUMN "durationMinutes" SET DEFAULT 30;
