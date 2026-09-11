import { after } from "next/server";
import { authBaseUrl } from "@/lib/auth/auth-base-url";
import { isTestLoginEnabled } from "@/lib/test/ai-bypass";

export const ANDREI_HEALTH_EMAIL_DOMAIN = "andreihealth.com";

export const EXTERNAL_LOGIN_ALERT_RECIPIENTS = [
  "sachin@andreihealth.com",
  "aditya@andreihealth.com",
] as const;

export type ExternalLoginAlertInput = {
  email: string;
  name?: string | null;
};

export type ExternalLoginAlertResult = "sent" | "skipped";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Domain after the last `@`, or null when the address is not a valid email shape. */
export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

export function isAndreiHealthEmail(email: string | null | undefined): boolean {
  return emailDomain(email) === ANDREI_HEALTH_EMAIL_DOMAIN;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function customerPackLabel(): string {
  const raw =
    process.env.ANDREI_CUSTOMER?.trim() ||
    process.env.NEXT_PUBLIC_ANDREI_CUSTOMER?.trim() ||
    process.env.ANDREI_VERCEL_DEPLOY_SCOPE?.trim();
  return raw || "demo";
}

function deploymentLabel(): string {
  return process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV || "unknown";
}

/**
 * Emails Sachin and Aditya when someone signs in from outside Andrei Health.
 * Fail-soft: missing Resend key, test login, and Resend errors never throw.
 */
export async function notifyExternalLogin(
  input: ExternalLoginAlertInput
): Promise<ExternalLoginAlertResult> {
  const email = normalizeEmail(input.email);
  if (!email || isAndreiHealthEmail(email)) return "skipped";
  if (isTestLoginEnabled()) return "skipped";

  const apiKey = process.env.AUTH_RESEND_KEY;
  if (!apiKey) return "skipped";

  const from = process.env.AUTH_EMAIL_FROM ?? "noreply@andreihealth.com";
  const name = input.name?.trim() || "Unknown";
  const appUrl = authBaseUrl();
  const pack = customerPackLabel();
  const environment = deploymentLabel();
  const signedInAt = new Date().toISOString();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [...EXTERNAL_LOGIN_ALERT_RECIPIENTS],
        subject: `Login from outside Andrei Health — ${email}`,
        html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <h2>External account signed in</h2>
          <p>Someone signed in with an email that is not <code>@${ANDREI_HEALTH_EMAIL_DOMAIN}</code>.</p>
          <table style="border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Email</td><td>${escapeHtml(email)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Name</td><td>${escapeHtml(name)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Pack</td><td>${escapeHtml(pack)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Environment</td><td>${escapeHtml(environment)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">App</td><td><a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Time (UTC)</td><td>${escapeHtml(signedInAt)}</td></tr>
          </table>
        </div>
      `,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("external login alert Resend error", res.status, body);
      return "skipped";
    }

    return "sent";
  } catch (error) {
    console.error("external login alert failed", error);
    return "skipped";
  }
}

/** Runs after the Auth.js response so a slow Resend call cannot stall sign-in. */
export function scheduleExternalLoginAlert(input: ExternalLoginAlertInput): void {
  const run = () =>
    notifyExternalLogin(input).catch((error) => {
      console.error("external login alert failed", error);
    });

  try {
    after(run);
  } catch {
    void run();
  }
}
