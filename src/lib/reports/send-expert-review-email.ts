import { authBaseUrl } from "@/lib/auth/auth-base-url";
import {
  EXPERT_REVIEW_NOTE_MAX_LENGTH,
  HIDDEN_EXPERT_REVIEWER_EMAIL,
} from "@/lib/reports/hidden-expert-reviewer";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function expertReviewEditUrl(reportId: string): string {
  return `${authBaseUrl()}/reports/${encodeURIComponent(reportId)}/edit`;
}

export function clipExpertReviewNote(note: string): string {
  const trimmed = note.trim();
  if (trimmed.length <= EXPERT_REVIEW_NOTE_MAX_LENGTH) return trimmed;
  return trimmed.slice(0, EXPERT_REVIEW_NOTE_MAX_LENGTH);
}

export async function sendExpertReviewEmail(opts: {
  reportId: string;
  documentNo: string;
  requesterName: string;
  requesterEmail: string;
  note: string;
}): Promise<void> {
  const apiKey = process.env.AUTH_RESEND_KEY;
  if (!apiKey) throw new Error("AUTH_RESEND_KEY is not set");

  const from = process.env.AUTH_EMAIL_FROM ?? "noreply@andreihealth.com";
  const editUrl = expertReviewEditUrl(opts.reportId);
  const note = clipExpertReviewNote(opts.note);
  const noteHtml = note
    ? `<p><strong>Note from ${escapeHtml(opts.requesterName)}:</strong></p>
        <blockquote style="margin:0;padding:12px 16px;border-left:3px solid #2563eb;background:#f8fafc;white-space:pre-wrap;">${escapeHtml(note)}</blockquote>`
    : `<p style="color:#6b7280;">No note was included.</p>`;

  const recipients = Array.from(
    new Set(
      [HIDDEN_EXPERT_REVIEWER_EMAIL, normalizeRecipient(opts.requesterEmail)].filter(
        (email) => email.length > 0
      )
    )
  );

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `Expert review requested — ${opts.documentNo}`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <h2>Expert review requested</h2>
          <p>${escapeHtml(opts.requesterName)} (${escapeHtml(opts.requesterEmail)}) asked for an expert review of <strong>${escapeHtml(opts.documentNo)}</strong>.</p>
          ${noteHtml}
          <p><a href="${escapeHtml(editUrl)}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Open and edit the report</a></p>
          <p style="color:#6b7280;font-size:14px;">This link opens the report editor. You are assigned as a manager on the report.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error: ${res.status} ${body}`);
  }
}

function normalizeRecipient(email: string): string {
  return email.trim().toLowerCase();
}
