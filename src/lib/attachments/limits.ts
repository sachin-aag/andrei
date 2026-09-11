export type AttachmentLimits = {
  maxAttachmentBytes: number;
  maxAttachmentPages: number;
};

const DEFAULT_MAX_ATTACHMENT_BYTES = 262_144_000;
const DEFAULT_MAX_ATTACHMENT_PAGES = 500;

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
  };
}

function readPositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}
