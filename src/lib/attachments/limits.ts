export type AttachmentLimits = {
  maxAttachmentBytes: number;
  maxAttachmentPages: number;
  maxAttachmentsPerReport: number;
  maxAttachmentBytesPerReport: number;
};

const DEFAULT_MAX_ATTACHMENT_BYTES = 104_857_600;
const DEFAULT_MAX_ATTACHMENT_PAGES = 500;
const DEFAULT_MAX_ATTACHMENTS_PER_REPORT = 50;
const DEFAULT_MAX_ATTACHMENT_BYTES_PER_REPORT = 524_288_000;

export function getAttachmentLimits(): AttachmentLimits {
  return {
    maxAttachmentBytes: readPositiveIntEnv(
      "MAX_ATTACHMENT_BYTES",
      DEFAULT_MAX_ATTACHMENT_BYTES
    ),
    maxAttachmentPages: readPositiveIntEnv(
      "MAX_ATTACHMENT_PAGES",
      DEFAULT_MAX_ATTACHMENT_PAGES
    ),
    maxAttachmentsPerReport: readPositiveIntEnv(
      "MAX_ATTACHMENTS_PER_REPORT",
      DEFAULT_MAX_ATTACHMENTS_PER_REPORT
    ),
    maxAttachmentBytesPerReport: readPositiveIntEnv(
      "MAX_ATTACHMENT_BYTES_PER_REPORT",
      DEFAULT_MAX_ATTACHMENT_BYTES_PER_REPORT
    ),
  };
}

function readPositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}
