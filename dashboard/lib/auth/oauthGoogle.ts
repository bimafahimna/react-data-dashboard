import type { NextAuthOptions } from "next-auth";
import GoogleProvider, { type GoogleProfile } from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { setSessionTokens } from "@/lib/session";
import { env } from "@/env";

// NextAuth v4 reads these env vars directly.
process.env.NEXTAUTH_SECRET ||= env.AUTH_SECRET;
process.env.NEXTAUTH_URL ||= env.AUTH_URL;

class AccountConflictError extends Error {
  constructor() {
    super("ACCOUNT_CONFLICT");
    this.name = "AccountConflictError";
  }
}

async function findOrCreateGoogleUser(profile: {
  sub: string;
  email: string;
  name?: string | null;
  picture?: string | null;
}) {
  const normalizedEmail = profile.email.trim().toLowerCase();
  const fullName = profile.name?.trim() || normalizedEmail.split("@")[0];

  return prisma.$transaction(async (tx) => {
    const byGoogleId = await tx.user.findUnique({
      where: { googleId: profile.sub },
      select: { email: true, accountId: true },
    });
    if (byGoogleId) return byGoogleId;

    const byEmail = await tx.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, accountId: true, googleId: true },
    });

    if (byEmail) {
      if (byEmail.googleId && byEmail.googleId !== profile.sub) {
        throw new AccountConflictError();
      }
      return tx.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: profile.sub,
          avatarUrl: profile.picture ?? undefined,
        },
        select: { email: true, accountId: true },
      });
    }

    return tx.user.create({
      data: {
        email: normalizedEmail,
        fullName,
        googleId: profile.sub,
        avatarUrl: profile.picture ?? null,
        password: null,
      },
      select: { email: true, accountId: true },
    });
  });
}

export const authOptions: NextAuthOptions = {
  secret: env.AUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") {
        return "/login?error=provider_unsupported";
      }

      const googleProfile = profile as GoogleProfile | undefined;
      if (!googleProfile?.email) {
        return "/login?error=email_unavailable";
      }
      if (googleProfile.email_verified === false) {
        return "/login?error=email_unverified";
      }

      try {
        const dbUser = await findOrCreateGoogleUser({
          sub: googleProfile.sub,
          email: googleProfile.email,
          name: googleProfile.name,
          picture: googleProfile.picture,
        });
        await setSessionTokens({
          email: dbUser.email,
          accountId: dbUser.accountId,
        });
        return true;
      } catch (error) {
        if (error instanceof AccountConflictError) {
          return "/login?error=account_conflict";
        }
        console.error("Google sign-in failed:", error);
        return "/login?error=server_error";
      }
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return `${baseUrl}/dashboard`;
    },
  },
};
