import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authAccounts, authUsers, authVerificationTokens } from "@/db/schema/auth";
import { workspaceUsers } from "@/db/schema";
import { ensureWorkspaceUsersSeeded } from "@/lib/auth/workspace-users";

export const { handlers, auth, signIn, signOut } = NextAuth({
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
