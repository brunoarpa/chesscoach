import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account) return false;
      if (account.provider !== "google") return false;
      if (!user.email) return false;

      // Find or create user
      let dbUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (!dbUser) {
        // Create new user on first Google sign-in
        dbUser = await prisma.user.create({
          data: {
            email: user.email,
            image: user.image,
          },
        });
      }

      // Upsert the Account link
      await prisma.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
        update: {
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          expires_at: account.expires_at,
        },
        create: {
          userId: dbUser.id,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          expires_at: account.expires_at,
          token_type: account.token_type,
          scope: account.scope,
          id_token: account.id_token,
        },
      });

      // Block banned users
      if (dbUser.verificationStatus === "REJECTED" && dbUser.activityStatus === "INACTIVE") {
        return false;
      }

      // Update activity
      const wasInactive = (Date.now() - dbUser.lastActiveAt.getTime()) >= 24 * 60 * 60 * 1000;
      const hasPrice = dbUser.coachChatPrice !== null || dbUser.coachCallPrice !== null;
      const shouldForceUnavailable =
        (wasInactive || !hasPrice) &&
        dbUser.coachAvailability !== "UNAVAILABLE";

      await prisma.user.update({
        where: { id: dbUser.id },
        data: {
          lastActiveAt: new Date(),
          activityStatus: "ACTIVE",
          image: user.image ?? dbUser.image,
          ...(shouldForceUnavailable ? { coachAvailability: "UNAVAILABLE" } : {}),
        },
      });

      return true;
    },
    async jwt({ token, user, account }) {
      if (user && account && user.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true, role: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            id: true,
            username: true,
            role: true,
            verificationStatus: true,
          },
        });
        if (dbUser) {
          session.user.id = dbUser.id;
          (session.user as unknown as Record<string, unknown>).username = dbUser.username;
          (session.user as unknown as Record<string, unknown>).role = dbUser.role;
          (session.user as unknown as Record<string, unknown>).verificationStatus = dbUser.verificationStatus;
          (session.user as unknown as Record<string, unknown>).needsUsername = !dbUser.username;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
