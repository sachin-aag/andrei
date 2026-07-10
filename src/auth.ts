import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authAccounts, authUsers, authVerificationTokens } from "@/db/schema/auth";
import { workspaceUsers } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import {
  computePasswordExpiryState,
  getPasswordPolicy,
} from "@/lib/auth/password-policy";
import {
  clearFailedLoginAttempts,
  findWorkspaceUserForLogin,
  loadWorkspaceUserJwtState,
  loadWorkspaceUserJwtStateByEmail,
  recordFailedLoginAttempt,
} from "@/lib/auth/workspace-login";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Required when the app is reached via 127.0.0.1, Docker, or CI (not only Vercel).
  trustHost:
    !!process.env.VERCEL ||
    process.env.NODE_ENV === "development" ||
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
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)
          ?.trim()
          .toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const policy = await getPasswordPolicy();
        const wsUser = await findWorkspaceUserForLogin(email);
        if (!wsUser?.passwordHash) return null;
        if (wsUser.deactivatedAt) return null;
        if (wsUser.lockedAt) {
          return null;
        }

        const valid = await verifyPassword(password, wsUser.passwordHash);
        if (!valid) {
          const failedLoginAttempts = wsUser.failedLoginAttempts + 1;
          const locked = failedLoginAttempts >= policy.failedLoginAttemptLimit;
          await recordFailedLoginAttempt(
            wsUser.id,
            failedLoginAttempts,
            locked
          );
          return null;
        }

        if (wsUser.failedLoginAttempts > 0 || wsUser.lockedAt) {
          await clearFailedLoginAttempts(wsUser.id);
        }

        // Ensure auth_users row exists (Credentials provider skips the adapter)
        let authUser = await db.query.authUsers.findFirst({
          where: eq(authUsers.email, email),
        });
        if (!authUser) {
          const [created] = await db
            .insert(authUsers)
            .values({ email, name: wsUser.name, emailVerified: new Date() })
            .returning();
          authUser = created;
        }

        return { id: authUser.id, email: authUser.email, name: wsUser.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      try {
        const wsUser = await findWorkspaceUserForLogin(user.email);
        return !!wsUser && !wsUser.deactivatedAt;
      } catch {
        return false;
      }
    },
    async jwt({ token, user }) {
      const email =
        user?.email ??
        (typeof token.email === "string" ? token.email : undefined);
      let workspaceUserId = token.workspaceUserId as string | undefined;

      if (user?.email) {
        const wsUser = await db.query.workspaceUsers.findFirst({
          where: eq(workspaceUsers.email, user.email),
          columns: { id: true },
        });
        if (wsUser) workspaceUserId = wsUser.id;
      }

      if (workspaceUserId) {
        const policy = await getPasswordPolicy();
        const wsUser = await loadWorkspaceUserJwtState(workspaceUserId);
        if (!wsUser || wsUser.deactivatedAt) {
          delete token.workspaceUserId;
        } else {
          const expiryState = computePasswordExpiryState(wsUser, policy);
          token.workspaceUserId = wsUser.id;
          token.mustChangePassword = wsUser.mustChangePassword;
          token.passwordExpired = expiryState.expired;
        }
      } else if (email) {
        const policy = await getPasswordPolicy();
        const wsUser = await loadWorkspaceUserJwtStateByEmail(email);
        if (wsUser && !wsUser.deactivatedAt) {
          const expiryState = computePasswordExpiryState(wsUser, policy);
          token.workspaceUserId = wsUser.id;
          token.mustChangePassword = wsUser.mustChangePassword;
          token.passwordExpired = expiryState.expired;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.workspaceUserId) {
        session.user.workspaceUserId = token.workspaceUserId as string;
      }
      if (typeof token.mustChangePassword === "boolean") {
        session.user.mustChangePassword = token.mustChangePassword;
      }
      if (typeof token.passwordExpired === "boolean") {
        session.user.passwordExpired = token.passwordExpired;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=1",
  },
});
