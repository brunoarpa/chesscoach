import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { calculateCoachElo } from "@/lib/elo";
import { payCoachForLesson } from "@/lib/lesson-ledger";
import { createNotification } from "@/lib/notifications";

/**
 * Update activity status for all users based on lastActiveAt.
 * - Active: within 24 hours
 * - Away: 1-2 days + has pending requests  
 * - Inactive: 2+ days or hasn't responded to requests in 2+ days
 */
export async function updateActivityStatuses() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  // Set INACTIVE: no activity in 2+ days
  await prisma.user.updateMany({
    where: {
      lastActiveAt: { lt: twoDaysAgo },
      activityStatus: { not: "INACTIVE" },
    },
    data: { activityStatus: "INACTIVE" },
  });

  // Find users with pending requests older than 2 days (unresponsive coaches)
  const unresponsiveCoachIds = await prisma.lessonRequest.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: twoDaysAgo },
    },
    select: { coachId: true },
    distinct: ["coachId"],
  });

  if (unresponsiveCoachIds.length > 0) {
    await prisma.user.updateMany({
      where: {
        id: { in: unresponsiveCoachIds.map((r: { coachId: string }) => r.coachId) },
        activityStatus: { not: "INACTIVE" },
      },
      data: { activityStatus: "INACTIVE" },
    });
  }

  // Set AWAY: 1-2 days inactive and has pending requests
  const awayCoachIds = await prisma.lessonRequest.findMany({
    where: {
      status: "PENDING",
    },
    select: { coachId: true },
    distinct: ["coachId"],
  });

  if (awayCoachIds.length > 0) {
    await prisma.user.updateMany({
      where: {
        id: { in: awayCoachIds.map((r: { coachId: string }) => r.coachId) },
        lastActiveAt: { lt: oneDayAgo, gte: twoDaysAgo },
        activityStatus: "ACTIVE",
      },
      data: { activityStatus: "AWAY" },
    });
  }

  // Set ACTIVE: anyone active in last 24h
  await prisma.user.updateMany({
    where: {
      lastActiveAt: { gte: oneDayAgo },
      activityStatus: { not: "ACTIVE" },
    },
    data: { activityStatus: "ACTIVE" },
  });

  // Note: coachAvailability is deliberately NOT touched here. The stored value
  // is the coach's manual choice; the 24h-inactivity rule is derived at read
  // time via getEffectiveAvailability so it self-heals when the coach returns.
}

/**
 * Expire pending lesson requests older than 3 days.
 *
 * When `userId` is given (inline dashboard call), only that user's requests
 * are swept — keeps per-request work bounded instead of scanning the whole
 * table on every dashboard view. The cron calls it without arguments for the
 * global sweep.
 */
export async function expirePendingRequests(userId?: string) {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const now = new Date();

  // Expire requests that are either older than 3 days OR past their acceptance deadline
  const expiredRequests = await prisma.lessonRequest.findMany({
    where: {
      status: "PENDING",
      AND: [
        {
          OR: [
            { createdAt: { lt: threeDaysAgo } },
            { acceptanceDeadline: { lt: now } },
          ],
        },
        ...(userId ? [{ OR: [{ studentId: userId }, { coachId: userId }] }] : []),
      ],
    },
    include: {
      coach: { select: { username: true } },
    },
  });

  for (const request of expiredRequests) {
    // Atomic PENDING -> EXPIRED transition; only refund if we actually flipped it.
    const expired = await prisma.$transaction(async (tx) => {
      const flipped = await tx.lessonRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      if (flipped.count === 0) return false;
      if (request.isTrial) {
        await tx.user.update({
          where: { id: request.studentId },
          data: { freeTrialsRemaining: { increment: 1 } },
        });
      } else {
        await tx.user.update({
          where: { id: request.studentId },
          data: { reservedBalance: { decrement: request.estimatedCost } },
        });
      }
      if (request.timeSlotId) {
        await tx.timeSlot.update({
          where: { id: request.timeSlotId },
          data: { status: "AVAILABLE" },
        });
      }
      return true;
    });

    if (expired) {
      await createNotification({
        userId: request.studentId,
        type: "LESSON_DECLINED",
        title: "Request expired",
        body: `${request.coach.username ?? "The coach"} didn't respond in time, so your request expired and your ${request.isTrial ? "free trial was restored" : "funds were released"}.`,
        link: "/dashboard",
      });
    }
  }

  // Check for coach non-responsive pattern: 3+ expired in 7 days.
  // Only in the global (cron) run — it aggregates over the whole table.
  if (!userId) {
    await detectNonResponsiveCoaches();
  }
}

/**
 * Detect coaches who consistently don't respond to requests.
 * 3+ expired requests in 7 days triggers an abuse flag.
 */
async function detectNonResponsiveCoaches() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const nonResponsiveCoaches = await prisma.lessonRequest.groupBy({
    by: ["coachId"],
    where: {
      status: "EXPIRED",
      createdAt: { gte: sevenDaysAgo },
    },
    _count: { id: true },
    having: {
      id: { _count: { gte: 3 } },
    },
  });

  for (const coach of nonResponsiveCoaches) {
    // Avoid duplicate flags
    const recentFlag = await prisma.abuseFlag.findFirst({
      where: {
        userId: coach.coachId,
        type: "COACH_NON_RESPONSIVE",
        createdAt: { gte: sevenDaysAgo },
      },
    });

    if (!recentFlag) {
      await prisma.abuseFlag.create({
        data: {
          userId: coach.coachId,
          type: "COACH_NON_RESPONSIVE",
          severity: "LOW",
          details: `${coach._count.id} lesson requests expired (unanswered) in the last 7 days.`,
        },
      });
    }
  }
}

/**
 * Detect confirmation timeouts for *instant* (unscheduled) lessons.
 * Called by daily cron. Checks ACCEPTED instant lessons where the confirmation
 * window has passed (cooldown + 48 hours) and the lesson never started.
 *
 * IMPORTANT: scheduled lessons (those with a scheduledStartAt) are deliberately
 * excluded — their lifecycle is driven by the scheduled time via detectNoShows
 * (at the start) and autoCompleteLessons (after the end). Keying off respondedAt
 * here would otherwise expire a future scheduled lesson ~2 days after the coach
 * accepted it, before it ever happened.
 */
export async function detectConfirmationDisputes() {
  // Find ACCEPTED instant lessons where respondedAt + duration + 48h < now.
  // Reaching IN_PROGRESS requires both parties to join, so an instant lesson
  // still ACCEPTED past this window means it never started -> expire and refund.
  const acceptedLessons = await prisma.lessonRequest.findMany({
    where: {
      status: "ACCEPTED",
      respondedAt: { not: null },
      scheduledStartAt: null,
    },
    include: {
      student: { select: { username: true } },
      coach: { select: { username: true } },
    },
  });

  const now = Date.now();
  const DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours after cooldown

  for (const lesson of acceptedLessons) {
    if (!lesson.respondedAt) continue;

    const cooldownMs = Math.max(lesson.durationMinutes * 60 * 1000, 5 * 60 * 1000);
    const deadline = new Date(lesson.respondedAt).getTime() + cooldownMs + DISPUTE_WINDOW_MS;

    if (now <= deadline) continue; // Not yet past the window

    const studentConfirmed = lesson.studentConfirmed;
    const coachConfirmed = lesson.coachConfirmed;

    if (!studentConfirmed && !coachConfirmed) {
      // Neither confirmed — timeout, expire and refund.
      const claimed = await prisma.$transaction(async (tx) => {
        // Guard against the no-show sweep (which runs concurrently) having
        // already claimed this lesson — otherwise we'd refund reserved twice.
        const flipped = await tx.lessonRequest.updateMany({
          where: { id: lesson.id, status: "ACCEPTED" },
          data: { status: "EXPIRED" },
        });
        if (flipped.count === 0) return false;
        if (!lesson.isTrial) {
          await tx.user.update({
            where: { id: lesson.studentId },
            data: { reservedBalance: { decrement: lesson.estimatedCost } },
          });
        }
        return true;
      });

      if (claimed) {
        await prisma.abuseFlag.create({
          data: {
            userId: lesson.studentId,
            type: "CONFIRMATION_TIMEOUT",
            severity: "LOW",
            details: `Neither party confirmed lesson completion. Student: ${lesson.student.username}, Coach: ${lesson.coach.username}. Lesson expired and funds returned.`,
            relatedLessonId: lesson.id,
            relatedUserId: lesson.coachId,
          },
        });
        await createNotification({
          userId: lesson.studentId,
          type: "LESSON_CANCELLED",
          title: "Lesson expired",
          body: `Neither you nor ${lesson.coach.username ?? "the coach"} confirmed the lesson, so it expired and your funds were returned.`,
          link: "/dashboard",
        });
        await createNotification({
          userId: lesson.coachId,
          type: "LESSON_CANCELLED",
          title: "Lesson expired",
          body: `Neither you nor ${lesson.student.username ?? "the student"} confirmed the lesson, so it expired with no payment.`,
          link: "/dashboard",
        });
      }
    } else if (coachConfirmed && !studentConfirmed) {
      // Coach confirmed but student didn't respond within 48h — auto-complete
      // (student silence = satisfaction)
      const completed = await prisma.$transaction(async (tx) => {
        const flipped = await tx.lessonRequest.updateMany({
          where: { id: lesson.id, status: "ACCEPTED" },
          data: {
            status: "COMPLETED",
            studentConfirmed: true,
            completedAt: new Date(),
          },
        });
        if (flipped.count === 0) return false;
        await payCoachForLesson(tx, lesson);
        return true;
      });

      if (completed) {
        await createNotification({
          userId: lesson.studentId,
          type: "LESSON_COMPLETED",
          title: "Lesson completed",
          body: `You didn't confirm in time, so your lesson with ${lesson.coach.username ?? "your coach"} was auto-completed.`,
          link: "/dashboard",
        });
        await createNotification({
          userId: lesson.coachId,
          type: "LESSON_COMPLETED",
          title: "Lesson completed",
          body: lesson.isTrial
            ? `Your free trial with ${lesson.student.username ?? "the student"} was completed.`
            : `Your lesson with ${lesson.student.username ?? "the student"} was completed and your earnings were released.`,
          link: "/dashboard",
        });
      }
    } else {
      // Student confirmed but coach didn't — expire and refund
      const claimed = await prisma.$transaction(async (tx) => {
        const flipped = await tx.lessonRequest.updateMany({
          where: { id: lesson.id, status: "ACCEPTED" },
          data: { status: "EXPIRED" },
        });
        if (flipped.count === 0) return false;
        if (!lesson.isTrial) {
          await tx.user.update({
            where: { id: lesson.studentId },
            data: { reservedBalance: { decrement: lesson.estimatedCost } },
          });
        }
        return true;
      });

      if (claimed) {
        await prisma.abuseFlag.create({
          data: {
            userId: lesson.coachId,
            type: "ONE_SIDED_CONFIRMATION",
            severity: "MEDIUM",
            details: `Student confirmed but coach did not within 48h. Student: ${lesson.student.username}, Coach: ${lesson.coach.username}. Lesson expired and funds returned.`,
            relatedLessonId: lesson.id,
            relatedUserId: lesson.studentId,
          },
        });
        await createNotification({
          userId: lesson.studentId,
          type: "LESSON_CANCELLED",
          title: "Lesson expired",
          body: `${lesson.coach.username ?? "Your coach"} didn't confirm the lesson, so it expired and your funds were returned.`,
          link: "/dashboard",
        });
        await createNotification({
          userId: lesson.coachId,
          type: "LESSON_CANCELLED",
          title: "Lesson expired",
          body: `You didn't confirm the lesson with ${lesson.student.username ?? "the student"} in time, so it expired with no payment.`,
          link: "/dashboard",
        });
      }
    }
  }
}

const NO_SHOW_BUFFER_MS = 0; // No grace — coach must be ready by scheduled start
const NO_SHOW_ELO_PENALTY = 50;

// Window after the lesson's scheduled end during which a student can report
// the lesson as unsatisfactory. Once this elapses, the lesson auto-completes
// and the coach is paid.
export const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Compute the moment at which an IN_PROGRESS lesson will auto-complete.
 * Falls back to respondedAt + duration when scheduledEndAt is missing.
 */
export function getAutoCompleteAt(lesson: {
  scheduledEndAt: Date | null;
  respondedAt: Date | null;
  durationMinutes: number;
}): Date | null {
  if (lesson.scheduledEndAt) {
    return new Date(lesson.scheduledEndAt.getTime() + DISPUTE_WINDOW_MS);
  }
  if (lesson.respondedAt) {
    return new Date(
      lesson.respondedAt.getTime() +
        lesson.durationMinutes * 60 * 1000 +
        DISPUTE_WINDOW_MS,
    );
  }
  return null;
}

/**
 * Auto-complete IN_PROGRESS lessons whose dispute window has elapsed.
 * Student silence = satisfaction: payment transfers to the coach. There is no
 * manual "confirm" step — once the room closes and no no-show/dispute flag was
 * raised, the lesson proceeds to completion on its own.
 *
 * Handles both scheduled lessons (window measured from scheduledEndAt) and
 * instant lessons (window measured from respondedAt + duration), gated per
 * lesson by getAutoCompleteAt so instant lessons aren't left stuck IN_PROGRESS
 * with the student's funds locked forever.
 *
 * When `userId` is given (inline dashboard call), only that user's lessons are
 * swept; the cron calls it without arguments for the global sweep.
 */
export async function autoCompleteLessons(userId?: string) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - DISPUTE_WINDOW_MS);

  const lessons = await prisma.lessonRequest.findMany({
    where: {
      status: "IN_PROGRESS",
      AND: [
        {
          OR: [
            // Scheduled lessons: dispute window runs from the scheduled end.
            { scheduledEndAt: { not: null, lte: cutoff } },
            // Instant lessons: no scheduled end — gated by getAutoCompleteAt below.
            { scheduledEndAt: null },
          ],
        },
        ...(userId ? [{ OR: [{ studentId: userId }, { coachId: userId }] }] : []),
      ],
    },
    include: {
      student: { select: { username: true } },
      coach: { select: { username: true } },
    },
  });

  for (const lesson of lessons) {
    // Honour each lesson's own auto-complete moment. For scheduled lessons this
    // matches the query's cutoff; for instant lessons it enforces
    // respondedAt + duration + dispute window.
    const autoAt = getAutoCompleteAt(lesson);
    if (!autoAt || autoAt.getTime() > now.getTime()) continue;

    const completed = await prisma.$transaction(async (tx) => {
      // Re-check status under the implicit row state to avoid double-processing.
      const fresh = await tx.lessonRequest.findUnique({
        where: { id: lesson.id },
        select: { status: true },
      });
      if (!fresh || fresh.status !== "IN_PROGRESS") return false;

      await tx.lessonRequest.update({
        where: { id: lesson.id },
        data: {
          status: "COMPLETED",
          completedAt: now,
          studentConfirmed: true,
          coachConfirmed: true,
        },
      });

      await payCoachForLesson(tx, lesson);

      // Free trials don't count toward playersTaught / lessonsGiven stats.
      const distinctStudents = await tx.lessonRequest.findMany({
        where: { coachId: lesson.coachId, status: "COMPLETED", isTrial: false },
        select: { studentId: true },
        distinct: ["studentId"],
      });
      await tx.user.update({
        where: { id: lesson.coachId },
        data: { playersTaught: distinctStudents.length },
      });

      const newElo = await calculateCoachElo(lesson.coachId, tx);
      await tx.user.update({
        where: { id: lesson.coachId },
        data: { coachElo: newElo },
      });
      return true;
    });

    if (completed) {
      await createNotification({
        userId: lesson.studentId,
        type: "LESSON_COMPLETED",
        title: "Lesson completed",
        body: `Your lesson with ${lesson.coach.username ?? "your coach"} was completed.`,
        link: "/dashboard",
      });
      await createNotification({
        userId: lesson.coachId,
        type: "LESSON_COMPLETED",
        title: "Lesson completed",
        body: lesson.isTrial
          ? `Your free trial with ${lesson.student.username ?? "the student"} was completed.`
          : `Your lesson with ${lesson.student.username ?? "the student"} was completed and your earnings were released.`,
        link: "/dashboard",
      });
    }
  }
}

/**
 * Auto-detect no-shows for ACCEPTED/IN_PROGRESS lessons
 * where the scheduled time + 5 min buffer has passed.
 */
export async function detectNoShows() {
  const bufferCutoff = new Date(Date.now() - NO_SHOW_BUFFER_MS);

  // Find active lessons past their start time + buffer where someone hasn't joined
  const lessons = await prisma.lessonRequest.findMany({
    where: {
      status: { in: ["ACCEPTED", "IN_PROGRESS"] },
      scheduledStartAt: { not: null, lte: bufferCutoff },
      OR: [
        { coachJoinedAt: null },
        { studentJoinedAt: null },
      ],
    },
    include: {
      student: { select: { username: true } },
      coach: { select: { username: true } },
    },
  });

  for (const lesson of lessons) {
    if (!lesson.coachJoinedAt && !lesson.studentJoinedAt) {
      // Neither joined — expire, make student whole.
      const expired = await prisma.$transaction(async (tx) => {
        // Atomically claim the lesson. If another task (manual report, the
        // confirmation-dispute sweep, or an overlapping cron) already moved it
        // out of ACCEPTED/IN_PROGRESS, bail so we don't double-refund.
        const flipped = await tx.lessonRequest.updateMany({
          where: { id: lesson.id, status: { in: ["ACCEPTED", "IN_PROGRESS"] } },
          data: { status: "EXPIRED" },
        });
        if (flipped.count === 0) return false;

        if (lesson.isTrial) {
          await tx.user.update({
            where: { id: lesson.studentId },
            data: { freeTrialsRemaining: { increment: 1 } },
          });
        } else {
          await tx.user.update({
            where: { id: lesson.studentId },
            data: { reservedBalance: { decrement: lesson.estimatedCost } },
          });
        }
        if (lesson.timeSlotId) {
          await tx.timeSlot.update({
            where: { id: lesson.timeSlotId },
            data: { status: "AVAILABLE" },
          });
        }
        return true;
      });

      if (expired) {
        await createNotification({
          userId: lesson.studentId,
          type: "LESSON_CANCELLED",
          title: "Lesson expired",
          body: `Neither you nor ${lesson.coach.username ?? "the coach"} joined the scheduled lesson, so it was cancelled and your ${lesson.isTrial ? "free trial was restored" : "funds were released"}.`,
          link: "/dashboard",
        });
        await createNotification({
          userId: lesson.coachId,
          type: "LESSON_CANCELLED",
          title: "Lesson expired",
          body: `Neither you nor ${lesson.student.username ?? "the student"} joined the scheduled lesson, so it was cancelled.`,
          link: "/dashboard",
        });
      }
    } else if (!lesson.coachJoinedAt) {
      // Coach didn't join — no-show. Student made whole, coach penalised.
      const claimed = await prisma.$transaction(async (tx) => {
        const flipped = await tx.lessonRequest.updateMany({
          where: { id: lesson.id, status: { in: ["ACCEPTED", "IN_PROGRESS"] } },
          data: { status: "NO_SHOW" },
        });
        if (flipped.count === 0) return false;

        if (lesson.isTrial) {
          await tx.user.update({
            where: { id: lesson.studentId },
            data: { freeTrialsRemaining: { increment: 1 } },
          });
        } else {
          await tx.user.update({
            where: { id: lesson.studentId },
            data: { reservedBalance: { decrement: lesson.estimatedCost } },
          });
        }
        await tx.user.update({
          where: { id: lesson.coachId },
          data: { coachRatingPenalty: { increment: NO_SHOW_ELO_PENALTY } },
        });
        if (lesson.timeSlotId) {
          await tx.timeSlot.update({
            where: { id: lesson.timeSlotId },
            data: { status: "AVAILABLE" },
          });
        }
        await tx.abuseFlag.create({
          data: {
            userId: lesson.coachId,
            type: "COACH_NO_SHOW",
            severity: "HIGH",
            details: `Coach "${lesson.coach.username}" did not join scheduled lesson with student "${lesson.student.username}". Auto-detected by system. Student refunded.`,
            relatedLessonId: lesson.id,
            relatedUserId: lesson.studentId,
          },
        });
        // Recalculate coach ELO inside the transaction so it reflects the
        // penalty atomically (matches the auto-complete path).
        const newElo = await calculateCoachElo(lesson.coachId, tx);
        await tx.user.update({
          where: { id: lesson.coachId },
          data: { coachElo: newElo },
        });
        return true;
      });

      if (claimed) {
        await createNotification({
          userId: lesson.coachId,
          type: "COACH_NO_SHOW",
          title: "No-show recorded",
          body: `You did not join the scheduled lesson with ${lesson.student.username ?? "the student"}. They were refunded and an ELO penalty was applied.`,
          link: "/dashboard",
        });
        await createNotification({
          userId: lesson.studentId,
          type: "COACH_NO_SHOW",
          title: "Coach didn't join",
          body: `${lesson.coach.username ?? "Your coach"} didn't join the scheduled lesson, so you were ${lesson.isTrial ? "given your free trial back" : "refunded"}.`,
          link: "/dashboard",
        });
      }
    } else if (!lesson.studentJoinedAt) {
      // Student didn't join — coach gets paid.
      const charged = await prisma.$transaction(async (tx) => {
        const flipped = await tx.lessonRequest.updateMany({
          where: { id: lesson.id, status: { in: ["ACCEPTED", "IN_PROGRESS"] } },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            coachConfirmed: true,
            studentConfirmed: true,
          },
        });
        if (flipped.count === 0) return false;

        await payCoachForLesson(tx, lesson);
        await tx.abuseFlag.create({
          data: {
            userId: lesson.studentId,
            type: "STUDENT_NO_SHOW",
            severity: "MEDIUM",
            details: `Student "${lesson.student.username}" did not join scheduled lesson with coach "${lesson.coach.username}". Auto-detected. Coach paid.`,
            relatedLessonId: lesson.id,
            relatedUserId: lesson.coachId,
          },
        });
        return true;
      });

      if (charged) {
        await createNotification({
          userId: lesson.studentId,
          type: "STUDENT_NO_SHOW",
          title: "No-show recorded",
          body: `You didn't join the scheduled lesson with ${lesson.coach.username ?? "your coach"}, so the lesson was charged.`,
          link: "/dashboard",
        });
        await createNotification({
          userId: lesson.coachId,
          type: "STUDENT_NO_SHOW",
          title: "Student didn't join",
          body: `${lesson.student.username ?? "The student"} didn't join the scheduled lesson.${lesson.isTrial ? "" : " You were paid for it."}`,
          link: "/dashboard",
        });
      }
    }
  }
}

// Retention window: lesson chat + free-text content is kept this long after the
// lesson finishes, then permanently deleted. Surfaced to users in the chat UI.
export const LESSON_DATA_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Purge chat messages and sensitive free-text content (request message, dispute
 * reason, board PGN) from lessons that finished more than 30 days ago.
 *
 * An unresolved dispute freezes the clock: lessons that are DISPUTED or carry an
 * open AbuseFlag are skipped, so the evidence survives until the dispute is
 * resolved. `dataPurgedAt` marks a lesson as done so it is never reprocessed.
 * Structural metadata (timestamps, status, the money ledger) is intentionally
 * kept for accounting and stats.
 */
export async function purgeExpiredLessonData() {
  const cutoff = new Date(Date.now() - LESSON_DATA_RETENTION_MS);

  const candidates = await prisma.lessonRequest.findMany({
    where: {
      dataPurgedAt: null,
      // Only terminal lessons — never touch ones still pending/active/disputed.
      status: { in: ["COMPLETED", "DECLINED", "EXPIRED", "CANCELLED", "NO_SHOW"] },
      // Freeze on any open report against this lesson.
      abuseFlags: { none: { resolved: false } },
      OR: [
        { completedAt: { lt: cutoff } },
        { completedAt: null, scheduledEndAt: { lt: cutoff } },
        { completedAt: null, scheduledEndAt: null, createdAt: { lt: cutoff } },
      ],
    },
    select: { id: true },
  });

  if (candidates.length === 0) return;

  const ids = candidates.map((l) => l.id);

  await prisma.$transaction([
    prisma.chatMessage.deleteMany({ where: { lessonRequestId: { in: ids } } }),
    prisma.lessonRequest.updateMany({
      where: { id: { in: ids } },
      data: {
        message: null,
        disputeReason: null,
        boardPgn: null,
        boardTree: Prisma.DbNull,
        dataPurgedAt: new Date(),
      },
    }),
  ]);
}
