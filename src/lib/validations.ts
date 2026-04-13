import { z } from "zod";

export const signupSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100),
  confirmPassword: z.string(),
  email: z
    .string()
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),
  continent: z.enum(["AFRICA", "ASIA", "EUROPE", "NORTH_AMERICA", "SOUTH_AMERICA", "OCEANIA"]).optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const profileEditSchema = z.object({
  continent: z.enum(["AFRICA", "ASIA", "EUROPE", "NORTH_AMERICA", "SOUTH_AMERICA", "OCEANIA"]).optional(),
  coachPricePerHour: z.coerce.number().min(0).optional(),
  gameReviewPrice: z.coerce.number().min(0).optional(),
  communicationPreference: z.enum(["CHAT_ONLY", "CHAT_AND_CALL"]),
  bio: z.string().max(500).optional(),
});

export const chessComUsernameSchema = z.object({
  chessComUsername: z
    .string()
    .min(1, "Chess.com username is required")
    .max(50),
});

export const lessonRequestSchema = z.object({
  coachId: z.string().min(1),
  type: z.enum(["GAME_REVIEW", "LESSON"]),
  durationMinutes: z.coerce.number().min(5).max(480),
});

export const reviewSchema = z.object({
  lessonId: z.string().min(1),
  rating: z.coerce.number().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export const depositSchema = z.object({
  amount: z.coerce.number().min(500, "Minimum deposit is $5.00"), // cents
});

export const resetPasswordRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileEditInput = z.infer<typeof profileEditSchema>;
export type LessonRequestInput = z.infer<typeof lessonRequestSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type DepositInput = z.infer<typeof depositSchema>;
