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

/** Max characters for a single direct message. Kept generous since this is
 * persistent messaging, not the throwaway 100-char lesson chat. */
export const MAX_DIRECT_MESSAGE_LENGTH = 2000;

export const directMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message can't be empty")
    .max(MAX_DIRECT_MESSAGE_LENGTH, `Message must be at most ${MAX_DIRECT_MESSAGE_LENGTH} characters`),
});

export type DirectMessageInput = z.infer<typeof directMessageSchema>;
export type UsernameInput = z.infer<typeof usernameSchema>;
export type LessonRequestInput = z.infer<typeof lessonRequestSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type DepositInput = z.infer<typeof depositSchema>;
