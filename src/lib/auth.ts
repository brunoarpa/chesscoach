import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { username: credentials.username as string },
        });

        if (!user) return null;

        // Block banned/rejected users from logging in
        if (user.verificationStatus === "REJECTED" && user.activityStatus === "INACTIVE") {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!isValid) return null;

        // Update last active
        await prisma.user.update({
          where: { id: user.id },
          data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
        });

        return {
          id: user.id,
          name: user.username,
          email: user.email,
          image: null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
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
