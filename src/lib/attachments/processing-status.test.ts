import { describe, expect, it } from "vitest";
import {
  hasPendingAttachments,
  isPendingAttachmentStatus,
  shouldShowDocumentUploadingNotice,
} from "./processing-status";

describe("isPendingAttachmentStatus", () => {
  it.each(["uploading", "validating", "queued", "processing"] as const)(
    "treats %s as in-flight",
    (status) => {
      expect(isPendingAttachmentStatus(status)).toBe(true);
    }
  );

  it.each(["ready", "failed"] as const)("treats %s as finished", (status) => {
    expect(isPendingAttachmentStatus(status)).toBe(false);
  });
});

describe("hasPendingAttachments", () => {
  it("is true when any attachment is still in flight", () => {
    expect(
      hasPendingAttachments([
        { processingStatus: "ready" },
        { processingStatus: "processing" },
      ])
    ).toBe(true);
  });

  it("is false when every attachment has finished", () => {
    expect(
      hasPendingAttachments([
        { processingStatus: "ready" },
        { processingStatus: "failed" },
      ])
    ).toBe(false);
  });
});

describe("shouldShowDocumentUploadingNotice", () => {
  it("stays hidden until the user types during an upload", () => {
    expect(shouldShowDocumentUploadingNotice(true, false)).toBe(false);
  });

  it("shows after the user types while a document is still in flight", () => {
    expect(shouldShowDocumentUploadingNotice(true, true)).toBe(true);
  });

  it("hides once processing is done", () => {
    expect(shouldShowDocumentUploadingNotice(false, true)).toBe(false);
  });
});
