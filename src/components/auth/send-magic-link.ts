import { signIn } from "next-auth/react";

export const MAGIC_LINK_SEND_ERROR =
  "Could not send a sign-in link. Please try again or use your password.";

export async function sendMagicLinkEmail(
  email: string,
  redirectTo?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await signIn("resend", {
      email,
      redirectTo: redirectTo ?? "/",
      redirect: false,
    });
    if (res?.error) {
      return { ok: false, error: MAGIC_LINK_SEND_ERROR };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: MAGIC_LINK_SEND_ERROR };
  }
}
