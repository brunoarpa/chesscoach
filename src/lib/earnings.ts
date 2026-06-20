import { prisma } from "@/lib/prisma";

/**
 * Earnings (in cents) tied to an unresolved student-no-show dispute.
 *
 * Those lessons auto-completed and paid the coach immediately, but an admin can
 * still side with the student and reverse the payment. A Stripe transfer can't
 * be pulled back once it lands, so this amount is held back from withdrawal
 * until the dispute resolves - guaranteeing a reversal always has the funds to
 * claw back instead of driving the coach's balance negative.
 *
 * STUDENT_NO_SHOW flags carry the coach as `relatedUser`. Trials never moved
 * money, so they're excluded. Single source of truth shared by the withdraw
 * route (enforcement) and the wallet UI (display) so the two can't drift.
 */
export async function getHeldEarnings(coachId: string): Promise<number> {
  const flags = await prisma.abuseFlag.findMany({
    where: {
      type: "STUDENT_NO_SHOW",
      resolved: false,
      relatedUserId: coachId,
    },
    select: { relatedLesson: { select: { estimatedCost: true, isTrial: true } } },
  });
  return flags.reduce(
    (sum, f) => sum + (f.relatedLesson && !f.relatedLesson.isTrial ? f.relatedLesson.estimatedCost : 0),
    0,
  );
}
