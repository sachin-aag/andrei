import { describe, expect, it } from "vitest";
import { attachmentBufferToPreviewHtml } from "@/lib/attachments/html-preview";

describe("attachmentBufferToPreviewHtml", () => {
  it("renders CSV through the spreadsheet preview", async () => {
    const html = await attachmentBufferToPreviewHtml(
      "csv",
      Buffer.from("a,b\n1,2\n"),
      { title: "t.csv" }
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
  });

  it("rejects PDFs", async () => {
    await expect(
      attachmentBufferToPreviewHtml("pdf", Buffer.from("%PDF-1.7\n"))
    ).rejects.toThrow(/Word, CSV, and Excel/i);
  });
});
