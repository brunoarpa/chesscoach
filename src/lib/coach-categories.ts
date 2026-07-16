import { Prisma } from "@/generated/prisma/client";

// Curated, high-intent landing pages for coach discovery. Each targets a real
// search ("chess coach for beginners", "affordable chess coach") and renders a
// genuinely distinct, filtered coach list, so these are category pages, not
// thin doorway pages. Keep the set small and concrete.
export interface CoachCategory {
  slug: string;
  h1: string;
  title: string; // <title>
  description: string; // meta description
  intro: string; // on-page intro paragraph
  // Extra filter ANDed with COACH_WHERE.
  filter: Prisma.UserWhereInput;
}

export const COACH_CATEGORIES: CoachCategory[] = [
  {
    slug: "for-beginners",
    h1: "Chess Coaches for Beginners",
    title: "Chess Coaches for Beginners - Online Lessons | EloChaser",
    description:
      "Find a patient online chess coach for beginners on EloChaser. These coaches offer free trial lessons, so you can start learning risk-free from a few dollars per slot.",
    intro:
      "New to chess or still learning the basics? These online chess coaches offer free trial lessons, so you can find a patient coach who explains things clearly before you pay anything. Book one-on-one lessons on a live board, in your own time, and start building real habits instead of grinding alone.",
    filter: { acceptingFreeTrials: true },
  },
  {
    slug: "affordable",
    h1: "Affordable Chess Coaches (From a Few Dollars a Lesson)",
    title: "Affordable Chess Coaches - Cheap Online Lessons | EloChaser",
    description:
      "Browse affordable online chess coaches on EloChaser with lessons from just a few dollars per 30-minute slot. Pay per lesson, no subscription, first lessons free.",
    intro:
      "Good coaching does not have to be expensive. These online chess coaches offer lessons at the lower end of the price range, from just a few dollars per 30-minute slot. You pay per lesson with no subscription, message any coach free, and get your first lessons free.",
    filter: { OR: [{ coachChatPrice: { lte: 500 } }, { coachCallPrice: { lte: 500 } }] },
  },
  {
    slug: "top-rated",
    h1: "Top-Rated Chess Coaches (1800+ Rated)",
    title: "Top-Rated Chess Coaches - Experienced Online Coaches | EloChaser",
    description:
      "Work with a strong, experienced online chess coach on EloChaser. These coaches are rated 1800+, ideal for serious improvers and tournament preparation.",
    intro:
      "Ready to push your game to the next level? These online chess coaches are rated 1800 and above, well-suited to serious improvers and tournament preparation. Review your games, sharpen your openings and endgames, and train with someone who has been where you want to go.",
    filter: { OR: [{ chessRating: { gte: 1800 } }, { coachElo: { gte: 1800 } }] },
  },
];

export function getCoachCategory(slug: string): CoachCategory | undefined {
  return COACH_CATEGORIES.find((c) => c.slug === slug);
}
