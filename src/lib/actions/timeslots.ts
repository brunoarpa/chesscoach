"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

/**
 * Offset (in ms) of an IANA timezone from UTC at a given instant.
 * Positive when the zone is ahead of UTC. Accounts for DST because the
 * offset is evaluated at `date` rather than assumed constant.
 */
function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  // Interpret the wall-clock reading as if it were UTC, then diff against the
  // real instant — the gap is the zone's offset at that moment.
  const asUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour % 24,
    map.minute,
    map.second
  );
  return asUTC - date.getTime();
}

/**
 * Convert a wall-clock time in a given IANA timezone to the corresponding UTC
 * instant. DST-safe: the offset is computed at the target instant (with one
 * refinement pass for the moment offsets change), not at an approximation.
 */
function wallTimeToUtc(
  year: number,
  month: number, // 0-indexed
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const utcGuess = Date.UTC(year, month, day, hour, minute, 0);
  const offset1 = tzOffsetMs(timeZone, new Date(utcGuess));
  let ts = utcGuess - offset1;
  const offset2 = tzOffsetMs(timeZone, new Date(ts));
  if (offset2 !== offset1) ts = utcGuess - offset2;
  return new Date(ts);
}

/**
 * Save a coach's weekly recurring availability template.
 * Replaces all existing templates for the coach.
 * Each slot is { dayOfWeek: 0-6, startHour: 0-23, startMinute: 0|15|30|45 }
 */
export async function saveWeeklyTemplate(
  slots: Array<{ dayOfWeek: number; startHour: number; startMinute: number }>
) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  // A timezone is required: template hours are wall-clock times interpreted in
  // the coach's timezone. Without it, slots would be generated in UTC and shown
  // to students at the wrong time.
  const coach = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { timezone: true },
  });
  if (!coach?.timezone) {
    return { error: "Set your timezone in your profile before saving availability." };
  }

  // Validate inputs
  for (const slot of slots) {
    if (
      slot.dayOfWeek < 0 || slot.dayOfWeek > 6 ||
      slot.startHour < 0 || slot.startHour > 23 ||
      ![0, 15, 30, 45].includes(slot.startMinute)
    ) {
      return { error: "Invalid slot data" };
    }
  }

  // Deduplicate
  const uniqueKey = (s: { dayOfWeek: number; startHour: number; startMinute: number }) =>
    `${s.dayOfWeek}-${s.startHour}-${s.startMinute}`;
  const seen = new Set<string>();
  const deduped = slots.filter((s) => {
    const k = uniqueKey(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Get existing templates
  const existing = await prisma.timeSlotTemplate.findMany({
    where: { coachId: session.user.id },
  });

  const existingKeys = new Set(existing.map((t) => `${t.dayOfWeek}-${t.startHour}-${t.startMinute}`));
  const newKeys = new Set(deduped.map(uniqueKey));

  // Templates to delete (existed before but not in new set)
  const toDelete = existing.filter((t) => !newKeys.has(`${t.dayOfWeek}-${t.startHour}-${t.startMinute}`));
  // Templates to create (in new set but didn't exist)
  const toCreate = deduped.filter((s) => !existingKeys.has(uniqueKey(s)));

  await prisma.$transaction([
    ...(toDelete.length > 0
      ? [prisma.timeSlotTemplate.deleteMany({
          where: { id: { in: toDelete.map((t) => t.id) } },
        })]
      : []),
    ...(toCreate.length > 0
      ? [prisma.timeSlotTemplate.createMany({
          data: toCreate.map((s) => ({
            coachId: session.user.id!,
            dayOfWeek: s.dayOfWeek,
            startHour: s.startHour,
            startMinute: s.startMinute,
          })),
        })]
      : []),
  ]);

  // Regenerate upcoming slots after template change
  await generateUpcomingSlots(session.user.id);

  revalidatePath("/dashboard");
  revalidatePath(`/profile`);
  return { success: true };
}

/**
 * Generate concrete TimeSlot records for the next 7 days from templates.
 * Skips already-booked slots and existing available slots from templates.
 */
export async function generateUpcomingSlots(coachId: string) {
  const templates = await prisma.timeSlotTemplate.findMany({
    where: { coachId },
  });

  if (templates.length === 0) return;

  const coach = await prisma.user.findUnique({
    where: { id: coachId },
    select: { timezone: true },
  });

  const now = new Date();
  const daysAhead = 7;
  const slotsToCreate: Array<{
    coachId: string;
    templateId: string;
    startTime: Date;
    endTime: Date;
    status: "AVAILABLE";
  }> = [];

  // Generate for each day in the next 7 days. Work entirely in UTC date math
  // so the day-of-week match is independent of the server's timezone.
  for (let d = 0; d < daysAhead; d++) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + d);

    for (const template of templates) {
      if (date.getUTCDay() !== template.dayOfWeek) continue;

      // Interpret the template's wall-clock hours in the coach's timezone and
      // convert to the corresponding UTC instant. Falls back to UTC only when
      // the coach has no timezone saved (older records — new saves require it).
      const startTime = coach?.timezone
        ? wallTimeToUtc(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            template.startHour,
            template.startMinute,
            coach.timezone
          )
        : new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            template.startHour,
            template.startMinute,
            0
          ));

      const endTime = new Date(startTime.getTime() + 15 * 60 * 1000);

      // Skip only past slots — coaches must accept anyway, so near-term bookings are fine.
      if (startTime.getTime() <= now.getTime()) continue;

      slotsToCreate.push({
        coachId,
        templateId: template.id,
        startTime,
        endTime,
        status: "AVAILABLE",
      });
    }
  }

  if (slotsToCreate.length === 0) return;

  // Find existing slots for this coach in the time range to avoid duplicates
  const minTime = slotsToCreate.reduce(
    (min, s) => (s.startTime < min ? s.startTime : min),
    slotsToCreate[0].startTime
  );
  const maxTime = slotsToCreate.reduce(
    (max, s) => (s.endTime > max ? s.endTime : max),
    slotsToCreate[0].endTime
  );

  const existingSlots = await prisma.timeSlot.findMany({
    where: {
      coachId,
      startTime: { gte: minTime, lte: maxTime },
    },
    select: { startTime: true, status: true },
  });

  const existingTimes = new Set(existingSlots.map((s) => s.startTime.getTime()));

  // Only create slots that don't already exist
  const newSlots = slotsToCreate.filter(
    (s) => !existingTimes.has(s.startTime.getTime())
  );

  if (newSlots.length > 0) {
    await prisma.timeSlot.createMany({
      data: newSlots,
      skipDuplicates: true,
    });
  }
}

/**
 * Get a coach's weekly template for the schedule editor.
 */
export async function getWeeklyTemplate() {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const templates = await prisma.timeSlotTemplate.findMany({
    where: { coachId: session.user.id },
    select: { dayOfWeek: true, startHour: true, startMinute: true },
    orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }, { startMinute: "asc" }],
  });

  return { templates };
}

/**
 * Get available slots for a coach (for students to book).
 * Returns slots for the next 7 days.
 */
export async function getAvailableSlots(coachId: string) {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const slots = await prisma.timeSlot.findMany({
    where: {
      coachId,
      status: "AVAILABLE",
      startTime: {
        gt: now, // any future slot — coach has to confirm anyway
        lte: weekFromNow,
      },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
    },
    orderBy: { startTime: "asc" },
  });

  return slots;
}

/**
 * Mark a specific day as unavailable (remove all available slots for that day).
 */
export async function setDayUnavailable(dateStr: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { error: "Invalid date" };

  const startOfDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  // Only mark non-booked slots as unavailable
  await prisma.timeSlot.updateMany({
    where: {
      coachId: session.user.id,
      startTime: { gte: startOfDay, lt: endOfDay },
      status: "AVAILABLE",
    },
    data: { status: "UNAVAILABLE" },
  });

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Restore a day's slots (mark UNAVAILABLE back to AVAILABLE).
 */
export async function restoreDay(dateStr: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { error: "Invalid date" };

  const startOfDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  await prisma.timeSlot.updateMany({
    where: {
      coachId: session.user.id,
      startTime: { gte: startOfDay, lt: endOfDay },
      status: "UNAVAILABLE",
    },
    data: { status: "AVAILABLE" },
  });

  revalidatePath("/dashboard");
  return { success: true };
}
