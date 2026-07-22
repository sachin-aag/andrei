import { describe, expect, it } from "vitest";
import { buildAttachmentObjectKey } from "@/lib/storage/gcs";

describe("buildAttachmentObjectKey", () => {
  it("sanitizes filenames and nests under report/attachment", () => {
    expect(
      buildAttachmentObjectKey("rep1", "att1", "My File (copy).pdf")
    ).toBe("reports/rep1/attachments/att1/My_File__copy_.pdf");
  });
});
