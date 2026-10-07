import {
  resolveResendApiKey,
  resolveResendFromAddress,
  sendResendEmail,
} from "@/lib/auth/resend-email";
import { getCustomerPack } from "@/lib/customers/packs";

type MagicLinkProvider = {
  apiKey?: string;
  from?: string;
};

/**
 * Auth.js `sendVerificationRequest` for the Resend provider.
 * Uses the same From-address 403 retry as password-reset mail so an
 * unverified pack sender (3xper) still delivers sign-in links.
 */
export async function sendMagicLinkVerificationRequest(params: {
  identifier: string;
  url: string;
  provider: MagicLinkProvider;
}): Promise<void> {
  const apiKey = params.provider.apiKey?.trim() || resolveResendApiKey();
  if (!apiKey) throw new Error("AUTH_RESEND_KEY is not set");

  const product = getCustomerPack().branding.productNameShort;
  const subject = `Sign in to ${product}`;
  const html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Sign in to ${product}</h2>
          <p>Click the link below to sign in. This link expires in 24 hours.</p>
          <p><a href="${params.url}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Sign in</a></p>
          <p style="color:#6b7280;font-size:14px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `;
  const text = `Sign in to ${product}: ${params.url}\nThis link expires in 24 hours.`;

  await sendResendEmail({
    apiKey,
    from: resolveResendFromAddress(params.provider.from),
    to: params.identifier,
    subject,
    html,
    text,
  });
}
