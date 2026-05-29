import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      workspaceUserId: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    workspaceUserId?: string;
  }
}
