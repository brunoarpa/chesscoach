import NextAuth, { CredentialsSignin } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

class InvalidCredentials extends CredentialsSignin {
  code = "invalid_credentials";
}
class EmailNotVerified extends CredentialsSignin {
  code = "email_not_verified";
}
class TooManyAttempts extends CredentialsSignin {
  code = "too_many_attempts";
}

/** Banned = rejected verification + deactivated. Mirrors the signIn() block. */
function isBanned(user: { verificationStatus: string; activityStatus: string }): boolean {
  return user.verificationStatus === "REJECTED" && user.activityStatus === "INACTIVE";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.toLowerCase().trim() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) throw new InvalidCredentials();

        // Throttle password guessing per email. A successful login clears the
        // bucket below, so only sustained failures lock the account out.
        const { success: rlOk } = await rateLimit(`login:${email}`, {
          maxAttempts: 10,
          windowMs: 15 * 60 * 1000,
        });
        if (!rlOk) throw new TooManyAttempts();

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) throw new InvalidCredentials();

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) throw new InvalidCredentials();

        if (!user.emailVerified) throw new EmailNotVerified();

        await resetRateLimit(`login:${email}`);
        return { id: user.id, email: user.email, image: user.image };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account) return false;

      // Credentials path — authorize() already validated. Just update activity.
      if (account.provider === "credentials") {
        if (!user.id) return false;
        const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
        if (!dbUser) return false;
        if (isBanned(dbUser)) return false;
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
        });
        return true;
      }

      if (account.provider !== "google") return false;
      if (!user.email) return false;

      // Find or create user (link to existing email account if present)
      let dbUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: {
            email: user.email,
            image: user.image,
            // Google verifies the email, so mark it verified on first sign-in.
            emailVerified: new Date(),
          },
        });
      } else if (!dbUser.emailVerified) {
        // Existing account was never email-verified, so any passwordHash on it
        // was set by someone who never proved they own this inbox (e.g. an
        // attacker who signed up with this email before the real owner). Google
        // proves ownership for THIS sign-in, but we must not retroactively bless
        // that unverified password — clear it. The owner can set a fresh one via
        // "Forgot password", which is gated on the email.
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { emailVerified: new Date(), passwordHash: null },
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
      if (isBanned(dbUser)) return false;

      // Update activity. coachAvailability stays untouched — the 24h rule is
      // derived at read time (getEffectiveAvailability), so signing back in
      // is what makes a coach appear Available again.
      await prisma.user.update({
        where: { id: dbUser.id },
        data: {
          lastActiveAt: new Date(),
          activityStatus: "ACTIVE",
          image: user.image ?? dbUser.image,
        },
      });

      return true;
    },
    async jwt({ token, user, account }) {
      if (user && account) {
        // Credentials: `user.id` is our DB id (returned by authorize).
        // OAuth: `user.id` is the provider's id, so look up by email instead.
        const dbUser =
          account.provider === "credentials" && user.id
            ? await prisma.user.findUnique({
                where: { id: user.id },
                select: { id: true, role: true },
              })
            : user.email
              ? await prisma.user.findUnique({
                  where: { email: user.email },
                  select: { id: true, role: true },
                })
              : null;
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
            activityStatus: true,
          },
        });
        // A ban must also kill existing sessions, not just new sign-ins: leave
        // the session unpopulated (no user id) so every auth check treats the
        // bearer as logged out for the remainder of their JWT's lifetime.
        if (dbUser && !isBanned(dbUser)) {
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
