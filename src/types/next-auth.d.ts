import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      workspaceUserId: string;
      mustChangePassword?: boolean;
      passwordExpired?: boolean;
      /** Compared to `workspace_users.session_version` to drop invalidated JWTs. */
      sessionVersion?: number;
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
    sessionVersion?: number;
    productTourSessionId?: string;
    /** Epoch ms of the last workspace-user / password-policy JWT refresh. */
    jwtStateCheckedAt?: number;
  }
}
