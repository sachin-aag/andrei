import { createHash } from "node:crypto";
import type { AutodiagnoseCategory } from "./types";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const SHA_RE = /\b[0-9a-f]{7,40}\b/gi;
const DEPLOYMENT_ID_RE = /\bdpl_[a-z0-9]+\b/gi;
const URL_RE = /https?:\/\/\S+/gi;
const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}T[\d:.]+Z/g;
const NEON_HOST_RE = /\b[a-z0-9-]+\.neon\.tech\b/gi;
const RECORD_ID_KEY_RE =
  /\b(reportId|sessionId|chatSessionId|userId|attachmentId)\s*[:=]\s*['"][^'"]+['"]/gi;
const TOOL_INPUT_VALUE_RE =
  /Value:\s*\{[\s\S]*?\}\s*(?=\.|Error message|$)/i;

export function normalizeErrorText(text: string): string {
  return text
    .replace(RECORD_ID_KEY_RE, "$1:<id>")
    .replace(TOOL_INPUT_VALUE_RE, "Value:<omitted>")
    .replace(UUID_RE, "<uuid>")
    .replace(DEPLOYMENT_ID_RE, "<dpl>")
    .replace(URL_RE, "<url>")
    .replace(ISO_DATE_RE, "<ts>")
    .replace(NEON_HOST_RE, "<neon-host>")
    .replace(SHA_RE, "<sha>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 800);
}

export function fingerprintError(input: {
  category: AutodiagnoseCategory;
  projectName: string | null;
  text: string;
}): string {
  const material = [
    input.category,
    (input.projectName ?? "").trim().toLowerCase(),
    normalizeErrorText(input.text),
  ].join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 12);
}

export const AUTODIAGNOSE_FINGERPRINT_COMMENT_PREFIX =
  "autodiagnose-fingerprint:";

export function fingerprintComment(fingerprint: string): string {
  return `<!-- ${AUTODIAGNOSE_FINGERPRINT_COMMENT_PREFIX} ${fingerprint} -->`;
}

export function fingerprintMarker(fingerprint: string): string {
  return `${AUTODIAGNOSE_FINGERPRINT_COMMENT_PREFIX} ${fingerprint}`;
}
