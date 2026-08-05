import { describe, expect, it } from "vitest";
import {
  formatAttachmentCountLimitMessage,
  formatAttachmentWouldExceedMessage,
  isAttachmentCountLimitError,
  isAttachmentQuotaError,
} from "./quota-messages";

describe("quota-messages", () => {
  it("detects count and storage quota errors", () => {
    expect(
      isAttachmentCountLimitError("Report already has 50 attachments")
    ).toBe(true);
    expect(isAttachmentQuotaError("Report already has 50 attachments")).toBe(
      true
    );
    expect(
      isAttachmentQuotaError("Report attachment storage limit exceeded")
    ).toBe(true);
    expect(isAttachmentQuotaError("Could not start upload")).toBe(false);
  });

  it("formats limit messages for the dialog", () => {
    expect(formatAttachmentCountLimitMessage(50)).toContain("maximum of 50");
    expect(
      formatAttachmentWouldExceedMessage({
        max: 50,
        remaining: 2,
        attempted: 5,
      })
    ).toContain("accept 2 more");
    expect(
      formatAttachmentWouldExceedMessage({
        max: 50,
        remaining: 0,
        attempted: 1,
      })
    ).toContain("maximum of 50");
  });
});
