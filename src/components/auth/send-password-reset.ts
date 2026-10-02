export const PASSWORD_RESET_SEND_ERROR =
  "Could not send a reset link. Please try again or contact your admin.";

export async function sendPasswordResetEmail(
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/auth-pw/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      return { ok: false, error: PASSWORD_RESET_SEND_ERROR };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: PASSWORD_RESET_SEND_ERROR };
  }
}
