import { describe, expect, it } from "vitest";
import { isAttachmentQuotaError } from "./quota-messages";

describe("quota-messages", () => {
  it("detects workspace storage and page budget errors", () => {
    expect(
      isAttachmentQuotaError(
        "This workspace has reached its attachment storage limit. Contact your administrator."
      )
    ).toBe(true);
    expect(
      isAttachmentQuotaError(
        "This workspace has reached its monthly attachment page processing limit. Contact your administrator."
      )
    ).toBe(true);
    expect(isAttachmentQuotaError("Report already has 50 attachments")).toBe(
      false
    );
    expect(isAttachmentQuotaError("Could not start upload")).toBe(false);
  });
});
