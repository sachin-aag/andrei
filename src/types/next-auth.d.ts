import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      workspaceUserId: string;
      mustChangePassword?: boolean;
      passwordExpired?: boolean;
    } & DefaultSession["user"];
    /** Unique per sign-in so Skip for now does not survive logout. */
    productTourSessionId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    workspaceUserId?: string;
    mustChangePassword?: boolean;
    passwordExpired?: boolean;
    productTourSessionId?: string;
  }
}
