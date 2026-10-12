import { authBaseUrl } from "@/lib/auth/auth-base-url";
import {
  resolveResendApiKey,
  resolveResendFromAddress,
  sendResendEmail,
} from "@/lib/auth/resend-email";
import { getCustomerPack } from "@/lib/customers/packs";
import { isTestLoginEnabled } from "@/lib/test/ai-bypass";

export {
  DEFAULT_RESEND_FROM,
  resolveResendFromAddress,
} from "@/lib/auth/resend-email";

/**
 * Sends a password-reset email via the Resend HTTP API.
 * Reuses the same AUTH_RESEND_KEY and AUTH_EMAIL_FROM used by NextAuth's Resend provider.
 */
export async function sendResetEmail(email: string, token: string) {
  // Playwright / ALLOW_TEST_LOGIN has no Resend key. Persist the token
  // (caller already wrote it) and skip the provider so lock-screen and
  // forgot-password can show the success screen instead of a 503.
  if (isTestLoginEnabled()) return;

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

  await sendResendEmail({
    apiKey,
    from,
    to: email,
    subject,
    html,
    text,
  });
}
