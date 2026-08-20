import { afterEach, describe, expect, it, vi } from "vitest";
import { getAttachmentLimits } from "./limits";

describe("getAttachmentLimits", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses defaults when env vars are unset", () => {
    expect(getAttachmentLimits()).toEqual({
      maxAttachmentBytes: 157_286_400,
      maxAttachmentPages: 500,
      maxAttachmentsPerReport: 50,
      maxAttachmentBytesPerReport: 786_432_000,
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

    expect(getAttachmentLimits().maxAttachmentBytes).toBe(157_286_400);
    expect(getAttachmentLimits().maxAttachmentPages).toBe(500);
  });
});
