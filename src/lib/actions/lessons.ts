"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function createLessonRequest(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const coachId = formData.get("coachId") as string;
  const type = formData.get("type") as "GAME_REVIEW" | "LESSON";
  const durationMinutes = Number(formData.get("durationMinutes"));

  if (!coachId || !type || !durationMinutes) {
    return { error: "Missing required fields" };
  }

  if (coachId === session.user.id) {
    return { error: "You cannot request a lesson from yourself" };
  }

  // Get coach to calculate price
  const coach = await prisma.user.findUnique({
    where: { id: coachId },
    select: {
      coachPricePerHour: true,
      gameReviewPrice: true,
      verificationStatus: true,
      activityStatus: true,
      coachingEnabled: true,
    },
  });

  if (!coach) return { error: "Coach not found" };
  if (coach.verificationStatus !== "VERIFIED") {
    return { error: "Coach is not verified" };
  }
  if (!coach.coachingEnabled) {
    return { error: "This coach is not currently accepting students" };
  }

  // Calculate cost
  let estimatedCost: number;
  if (type === "GAME_REVIEW") {
    if (!coach.gameReviewPrice) return { error: "Coach doesn't offer game reviews" };
    const reviewCount = Math.ceil(durationMinutes / 5);
    estimatedCost = coach.gameReviewPrice * reviewCount;
  } else {
    if (!coach.coachPricePerHour) return { error: "Coach doesn't offer lessons" };
    estimatedCost = Math.round((coach.coachPricePerHour * durationMinutes) / 60);
  }

  // Check student wallet
  const student = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { walletBalance: true, reservedBalance: true },
  });

  if (!student) return { error: "User not found" };

  const available = student.walletBalance - student.reservedBalance;
  if (available < estimatedCost) {
    return { error: `Insufficient balance. You need $${(estimatedCost / 100).toFixed(2)} but only have $${(available / 100).toFixed(2)} available.` };
  }

  // Create request and reserve funds
  await prisma.$transaction([
    prisma.lessonRequest.create({
      data: {
        studentId: session.user.id,
        coachId,
        type,
        durationMinutes,
        estimatedCost,
      },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: {
        reservedBalance: { increment: estimatedCost },
        lastActiveAt: new Date(),
        activityStatus: "ACTIVE",
      },
    }),
  ]);

  revalidatePath("/dashboard");
  return { success: true };
}

export async function respondToLessonRequest(
  requestId: string,
  action: "accept" | "decline"
) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const request = await prisma.lessonRequest.findUnique({
    where: { id: requestId },
    include: { student: true, coach: true },
  });

  if (!request) return { error: "Request not found" };
  if (request.coachId !== session.user.id) return { error: "Not authorized" };
  if (request.status !== "PENDING") return { error: "Request is no longer pending" };

  if (action === "accept") {
    await prisma.$transaction([
      prisma.lessonRequest.update({
        where: { id: requestId },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: session.user.id },
        data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
      }),
    ]);
  } else {
    // Decline: release reserved funds
    await prisma.$transaction([
      prisma.lessonRequest.update({
        where: { id: requestId },
        data: { status: "DECLINED", respondedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: request.studentId },
        data: { reservedBalance: { decrement: request.estimatedCost } },
      }),
      prisma.user.update({
        where: { id: session.user.id },
        data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
      }),
    ]);
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function confirmLesson(requestId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const request = await prisma.lessonRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) return { error: "Request not found" };
  if (request.status !== "ACCEPTED") return { error: "Lesson must be accepted first" };

  const isStudent = request.studentId === session.user.id;
  const isCoach = request.coachId === session.user.id;
  if (!isStudent && !isCoach) return { error: "Not authorized" };

  const updateData: Record<string, boolean> = {};
  if (isStudent) updateData.studentConfirmed = true;
  if (isCoach) updateData.coachConfirmed = true;

  const newStudentConfirmed = isStudent ? true : request.studentConfirmed;
  const newCoachConfirmed = isCoach ? true : request.coachConfirmed;
  const bothConfirmed = newStudentConfirmed && newCoachConfirmed;

  if (bothConfirmed) {
    // Complete the lesson: transfer money
    await prisma.$transaction([
      prisma.lessonRequest.update({
        where: { id: requestId },
        data: {
          ...updateData,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      }),
      // Debit student
      prisma.user.update({
        where: { id: request.studentId },
        data: {
          walletBalance: { decrement: request.estimatedCost },
          reservedBalance: { decrement: request.estimatedCost },
          lessonsTaken: { increment: 1 },
          lastActiveAt: new Date(),
          activityStatus: "ACTIVE",
        },
      }),
      // Credit coach
      prisma.user.update({
        where: { id: request.coachId },
        data: {
          pendingEarnings: { increment: request.estimatedCost },
          totalEarningsAllTime: { increment: request.estimatedCost },
          lessonsGiven: { increment: 1 },
          lastActiveAt: new Date(),
          activityStatus: "ACTIVE",
        },
      }),
      // Record transactions
      prisma.transaction.create({
        data: {
          userId: request.studentId,
          type: "LESSON_PAYMENT",
          amount: -request.estimatedCost,
          lessonRequestId: requestId,
        },
      }),
      prisma.transaction.create({
        data: {
          userId: request.coachId,
          type: "LESSON_PAYMENT",
          amount: request.estimatedCost,
          lessonRequestId: requestId,
        },
      }),
      // Record earning for ELO
      prisma.earningRecord.create({
        data: {
          userId: request.coachId,
          amount: request.estimatedCost,
        },
      }),
    ]);

    // Update players taught count (distinct students)
    const distinctStudents = await prisma.lessonRequest.findMany({
      where: { coachId: request.coachId, status: "COMPLETED" },
      select: { studentId: true },
      distinct: ["studentId"],
    });
    await prisma.user.update({
      where: { id: request.coachId },
      data: { playersTaught: distinctStudents.length },
    });
  } else {
    await prisma.$transaction([
      prisma.lessonRequest.update({
        where: { id: requestId },
        data: updateData,
      }),
      prisma.user.update({
        where: { id: session.user.id },
        data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
      }),
    ]);
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function cancelLessonRequest(requestId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const request = await prisma.lessonRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) return { error: "Request not found" };
  if (request.studentId !== session.user.id) return { error: "Not authorized" };
  if (request.status !== "PENDING") return { error: "Can only cancel pending requests" };

  await prisma.$transaction([
    prisma.lessonRequest.update({
      where: { id: requestId },
      data: { status: "CANCELLED" },
    }),
    prisma.user.update({
      where: { id: request.studentId },
      data: { reservedBalance: { decrement: request.estimatedCost } },
    }),
  ]);

  revalidatePath("/dashboard");
  return { success: true };
}

export async function submitReview(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const lessonId = formData.get("lessonId") as string;
  const rating = Number(formData.get("rating"));
  const comment = (formData.get("comment") as string) || null;

  if (!lessonId || !rating || rating < 1 || rating > 5) {
    return { error: "Invalid review data" };
  }

  const lesson = await prisma.lessonRequest.findUnique({
    where: { id: lessonId },
  });

  if (!lesson) return { error: "Lesson not found" };
  if (lesson.status !== "COMPLETED") return { error: "Lesson must be completed first" };

  const isStudent = lesson.studentId === session.user.id;
  const isCoach = lesson.coachId === session.user.id;
  if (!isStudent && !isCoach) return { error: "Not authorized" };

  // Determine who we're reviewing
  const toUserId = isStudent ? lesson.coachId : lesson.studentId;

  // Check for existing review
  const existingReview = await prisma.review.findUnique({
    where: { fromUserId_lessonId: { fromUserId: session.user.id, lessonId } },
  });
  if (existingReview) return { error: "You already reviewed this lesson" };

  await prisma.review.create({
    data: {
      fromUserId: session.user.id,
      toUserId,
      lessonId,
      rating,
      comment,
    },
  });

  revalidatePath("/dashboard");
  return { success: true };
}
