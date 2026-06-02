import { authBaseUrl } from "@/lib/auth/auth-base-url";

/**
 * Sends a password-reset email via the Resend HTTP API.
 * Reuses the same AUTH_RESEND_KEY and AUTH_EMAIL_FROM used by NextAuth's Resend provider.
 */
export async function sendResetEmail(email: string, token: string) {
  const apiKey = process.env.AUTH_RESEND_KEY;
  if (!apiKey) throw new Error("AUTH_RESEND_KEY is not set");

  const from = process.env.AUTH_EMAIL_FROM ?? "noreply@andreihealth.com";
  const resetUrl = `${authBaseUrl()}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Reset your password — Andrei",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Reset your password</h2>
          <p>Click the link below to set a new password. This link expires in 1 hour.</p>
          <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Reset password</a></p>
          <p style="color:#6b7280;font-size:14px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error: ${res.status} ${body}`);
  }
}
