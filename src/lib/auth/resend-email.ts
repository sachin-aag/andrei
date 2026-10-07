export const DEFAULT_RESEND_FROM = "noreply@andreihealth.com";

/** Pack From addresses must match a verified Resend domain. */
export function resolveResendFromAddress(
  raw = process.env.AUTH_EMAIL_FROM
): string {
  const trimmed = raw?.trim().replace(/^["']|["']$/g, "") ?? "";
  return trimmed || DEFAULT_RESEND_FROM;
}

export function resolveResendApiKey(): string | undefined {
  const key =
    process.env.AUTH_RESEND_KEY?.trim() || process.env.RESEND_API_KEY?.trim();
  return key || undefined;
}

export type ResendEmailPayload = {
  apiKey: string;
  from?: string;
  to: string | readonly string[];
  subject: string;
  html: string;
  text?: string;
};

async function postResendEmail(opts: {
  apiKey: string;
  from: string;
  to: string | readonly string[];
  subject: string;
  html: string;
  text?: string;
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
      ...(opts.text ? { text: opts.text } : {}),
    }),
  });

  if (res.ok) return { ok: true };
  return { ok: false, status: res.status, body: await res.text() };
}

/**
 * Sends via Resend. A 403 from an unverified pack From (historically
 * `noreply@3xper.com`) retries once as `noreply@andreihealth.com`.
 */
export async function sendResendEmail(opts: ResendEmailPayload): Promise<void> {
  const from = opts.from ?? resolveResendFromAddress();
  let result = await postResendEmail({ ...opts, from });

  if (
    !result.ok &&
    result.status === 403 &&
    from.toLowerCase() !== DEFAULT_RESEND_FROM.toLowerCase()
  ) {
    console.error(
      `Resend rejected from=${from} (403); retrying with ${DEFAULT_RESEND_FROM}`
    );
    result = await postResendEmail({ ...opts, from: DEFAULT_RESEND_FROM });
  }

  if (!result.ok) {
    throw new Error(`Resend API error: ${result.status} ${result.body}`);
  }
}
