import { afterEach, describe, expect, it, vi } from "vitest";
import { getAttachmentLimits } from "./limits";

describe("getAttachmentLimits", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses defaults when env vars are unset", () => {
    expect(getAttachmentLimits()).toEqual({
      maxAttachmentBytes: 104_857_600,
      maxAttachmentPages: 500,
      maxAttachmentsPerReport: 20,
      maxAttachmentBytesPerReport: 524_288_000,
    });
  });

  it("uses positive integer env overrides", () => {
    vi.stubEnv("MAX_ATTACHMENT_BYTES", "10");
    vi.stubEnv("MAX_ATTACHMENT_PAGES", "11");
    vi.stubEnv("MAX_ATTACHMENTS_PER_REPORT", "12");
    vi.stubEnv("MAX_ATTACHMENT_BYTES_PER_REPORT", "13");

    expect(getAttachmentLimits()).toEqual({
      maxAttachmentBytes: 10,
      maxAttachmentPages: 11,
      maxAttachmentsPerReport: 12,
      maxAttachmentBytesPerReport: 13,
    });
  });

  it("falls back for invalid env values", () => {
    vi.stubEnv("MAX_ATTACHMENT_BYTES", "0");
    vi.stubEnv("MAX_ATTACHMENT_PAGES", "not-a-number");

    expect(getAttachmentLimits().maxAttachmentBytes).toBe(104_857_600);
    expect(getAttachmentLimits().maxAttachmentPages).toBe(500);
  });
});
