import { UserRole, VerificationStatus } from "@/generated/prisma/enums";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string | null;
      role: UserRole;
      verificationStatus: VerificationStatus;
      needsUsername: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role?: string;
  }
}
