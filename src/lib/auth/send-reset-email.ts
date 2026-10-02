import { authBaseUrl } from "@/lib/auth/auth-base-url";
import { getCustomerPack } from "@/lib/customers/packs";

export const DEFAULT_RESEND_FROM = "noreply@andreihealth.com";

/**
 * Sends a password-reset email via the Resend HTTP API.
 * Reuses the same AUTH_RESEND_KEY and AUTH_EMAIL_FROM used by NextAuth's Resend provider.
 */
export function resolveResendFromAddress(
  raw = process.env.AUTH_EMAIL_FROM
): string {
  const trimmed = raw?.trim().replace(/^["']|["']$/g, "") ?? "";
  return trimmed || DEFAULT_RESEND_FROM;
}

function resolveResendApiKey(): string | undefined {
  const key =
    process.env.AUTH_RESEND_KEY?.trim() || process.env.RESEND_API_KEY?.trim();
  return key || undefined;
}

async function postResendEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (res.ok) return { ok: true };
  return { ok: false, status: res.status, body: await res.text() };
}

export async function sendResetEmail(email: string, token: string) {
  const apiKey = resolveResendApiKey();
  if (!apiKey) throw new Error("AUTH_RESEND_KEY is not set");

  const from = resolveResendFromAddress();
  const resetUrl = `${authBaseUrl()}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  const subject = getCustomerPack().branding.passwordResetSubject;
  const html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Reset your password</h2>
          <p>Click the link below to set a new password. This link expires in 1 hour.</p>
          <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Reset password</a></p>
          <p style="color:#6b7280;font-size:14px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `;
  const text = `Reset your password: ${resetUrl}\nThis link expires in 1 hour.`;

  let result = await postResendEmail({
    apiKey,
    from,
    to: email,
    subject,
    html,
    text,
  });

  if (
    !result.ok &&
    result.status === 403 &&
    from.toLowerCase() !== DEFAULT_RESEND_FROM
  ) {
    console.error(
      `Resend rejected from=${from} (403); retrying with ${DEFAULT_RESEND_FROM}`
    );
    result = await postResendEmail({
      apiKey,
      from: DEFAULT_RESEND_FROM,
      to: email,
      subject,
      html,
      text,
    });
  }

  if (!result.ok) {
    throw new Error(`Resend API error: ${result.status} ${result.body}`);
  }
}
