import { authBaseUrl } from "@/lib/auth/auth-base-url";
import { CUSTOMER_INSTANCE_LABELS, getCustomerPack } from "@/lib/customers/packs";
import { isTestLoginEnabled } from "@/lib/test/ai-bypass";
import {
  DEFAULT_LOGIN_NOTIFY_EMAILS,
  isInternalOperator,
} from "@/lib/ops/internal-operators";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function loginNotifyRecipients(
  raw = process.env.LOGIN_NOTIFY_EMAILS
): string[] {
  const parsed = (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
  if (parsed.length > 0) return [...new Set(parsed)];
  return [...DEFAULT_LOGIN_NOTIFY_EMAILS];
}

export function shouldNotifyLogin(user: {
  email?: string | null;
  name?: string | null;
}): boolean {
  if (process.env.LOGIN_NOTIFY_DISABLED === "true") return false;
  if (isTestLoginEnabled()) return false;
  if (!process.env.AUTH_RESEND_KEY) return false;
  if (isInternalOperator(user)) return false;
  return true;
}

export async function notifyExternalUserLogin(user: {
  name: string;
  email: string;
  role: string;
}): Promise<void> {
  if (!shouldNotifyLogin(user)) return;

  const apiKey = process.env.AUTH_RESEND_KEY;
  if (!apiKey) return;

  const pack = getCustomerPack();
  const instanceLabel = CUSTOMER_INSTANCE_LABELS[pack.id];
  const from = process.env.AUTH_EMAIL_FROM ?? "noreply@andreihealth.com";
  const origin = authBaseUrl();
  const when = new Date().toISOString();
  const recipients = loginNotifyRecipients().filter(
    (email) => email !== user.email.trim().toLowerCase()
  );
  if (recipients.length === 0) return;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `[${instanceLabel}] ${user.name} signed in`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <h2>Sign-in on ${escapeHtml(instanceLabel)}</h2>
          <p><strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.email)}) signed in as ${escapeHtml(user.role)}.</p>
          <p>Instance: ${escapeHtml(pack.branding.productName)} (${escapeHtml(instanceLabel)})</p>
          <p>Time (UTC): ${escapeHtml(when)}</p>
          <p><a href="${escapeHtml(origin)}">${escapeHtml(origin)}</a></p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error: ${res.status} ${body}`);
  }
}
