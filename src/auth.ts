import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authAccounts, authUsers, authVerificationTokens } from "@/db/schema/auth";
import { workspaceUsers } from "@/db/schema";
import { ensureWorkspaceUsersSeeded } from "@/lib/auth/workspace-users";

const ALLOWED_EMAIL_DOMAINS = ["@mjbiopharm.com"];
const ALLOWED_EMAILS = ["sachinagrawal272@gmail.com", "aditya.ambani@gmail.com"];

function isAllowedEmail(email: string): boolean {
  return (
    ALLOWED_EMAILS.includes(email) ||
    ALLOWED_EMAIL_DOMAINS.some((domain) => email.endsWith(domain))
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Required when the app is reached via 127.0.0.1, Docker, or CI (not only Vercel).
  trustHost:
    (!!process.env.VERCEL && process.env.VERCEL_ENV !== "production") ||
    process.env.AUTH_TRUST_HOST === "true" ||
    process.env.AUTH_TRUST_HOST === "1",
  adapter: DrizzleAdapter(db, {
    usersTable: authUsers,
    accountsTable: authAccounts,
    verificationTokensTable: authVerificationTokens,
  }),
  providers: [
    Resend({
      from: process.env.AUTH_EMAIL_FROM ?? "noreply@andreihealth.com",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      if (!isAllowedEmail(user.email)) return false;
      try {
        await ensureWorkspaceUsersSeeded();
        const wsUser = await db.query.workspaceUsers.findFirst({
          where: eq(workspaceUsers.email, user.email),
        });
        return !!wsUser;
      } catch {
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const wsUser = await db.query.workspaceUsers.findFirst({
          where: eq(workspaceUsers.email, user.email),
        });
        if (wsUser) {
          token.workspaceUserId = wsUser.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.workspaceUserId) {
        session.user.workspaceUserId = token.workspaceUserId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=1",
  },
});
