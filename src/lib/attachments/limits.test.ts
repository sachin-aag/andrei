import { afterEach, describe, expect, it, vi } from "vitest";
import { getAttachmentLimits } from "./limits";

describe("getAttachmentLimits", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses defaults when env vars are unset", () => {
    expect(getAttachmentLimits()).toEqual({
      maxAttachmentBytes: 262_144_000,
      maxAttachmentPages: 500,
    });
  });

  it("uses positive integer env overrides", () => {
    vi.stubEnv("MAX_ATTACHMENT_BYTES", "10");
    vi.stubEnv("MAX_ATTACHMENT_PAGES", "11");

    expect(getAttachmentLimits()).toEqual({
      maxAttachmentBytes: 10,
      maxAttachmentPages: 11,
    });
  });

  it("falls back for invalid env values", () => {
    vi.stubEnv("MAX_ATTACHMENT_BYTES", "0");
    vi.stubEnv("MAX_ATTACHMENT_PAGES", "not-a-number");

    expect(getAttachmentLimits().maxAttachmentBytes).toBe(262_144_000);
    expect(getAttachmentLimits().maxAttachmentPages).toBe(500);
  });
});
