import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authAccounts, authUsers, authVerificationTokens } from "@/db/schema/auth";
import { workspaceUsers } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";

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
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const wsUser = await db.query.workspaceUsers.findFirst({
          where: eq(workspaceUsers.email, email),
        });
        if (!wsUser?.passwordHash) return null;

        const valid = await verifyPassword(password, wsUser.passwordHash);
        if (!valid) return null;

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
      if (!isAllowedEmail(user.email)) return false;
      try {
        const wsUser = await db.query.workspaceUsers.findFirst({
          where: eq(workspaceUsers.email, user.email),
        });
        return !!wsUser;
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
        const wsUser = await db.query.workspaceUsers.findFirst({
          where: eq(workspaceUsers.id, workspaceUserId),
          columns: { id: true, mustChangePassword: true },
        });
        if (wsUser) {
          token.workspaceUserId = wsUser.id;
          token.mustChangePassword = wsUser.mustChangePassword;
        }
      } else if (email) {
        const wsUser = await db.query.workspaceUsers.findFirst({
          where: eq(workspaceUsers.email, email),
          columns: { id: true, mustChangePassword: true },
        });
        if (wsUser) {
          token.workspaceUserId = wsUser.id;
          token.mustChangePassword = wsUser.mustChangePassword;
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
      return session;
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=1",
  },
});
