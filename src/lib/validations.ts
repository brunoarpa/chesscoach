import { z } from "zod";

export const usernameSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
});

export const chessComUsernameSchema = z.object({
  chessComUsername: z
    .string()
    .min(1, "Chess.com username is required")
    .max(50),
});

export const lessonRequestSchema = z.object({
  coachId: z.string().min(1),
  timeSlotId: z.string().min(1),
});

export const reviewSchema = z.object({
  lessonId: z.string().min(1),
  rating: z.coerce.number().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export const depositSchema = z.object({
  amount: z.coerce.number().min(500, "Minimum deposit is $5.00"), // cents
});

export type UsernameInput = z.infer<typeof usernameSchema>;
export type LessonRequestInput = z.infer<typeof lessonRequestSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type DepositInput = z.infer<typeof depositSchema>;
