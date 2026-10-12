import { describe, expect, it } from "vitest";
import { spreadsheetBufferToPreviewHtml } from "@/lib/attachments/spreadsheet-preview";

describe("spreadsheetBufferToPreviewHtml", () => {
  it("renders CSV headers and escaped cells", async () => {
    const html = await spreadsheetBufferToPreviewHtml(
      "csv",
      Buffer.from('batch,note\nB-1,"<pass>&"\n'),
      { title: "results.csv" }
    );
    expect(html).toContain("<title>results.csv</title>");
    expect(html).toContain("<th>batch</th>");
    expect(html).toContain("<td>B-1</td>");
    expect(html).toContain("&lt;pass&gt;&amp;");
    expect(html).not.toContain("<pass>");
  });

  it("notes when a sheet is truncated to the preview row cap", async () => {
    const rows = ["h1,h2", ...Array.from({ length: 501 }, (_, i) => `${i},x`)];
    const html = await spreadsheetBufferToPreviewHtml(
      "csv",
      Buffer.from(`${rows.join("\n")}\n`)
    );
    expect(html).toContain("Showing the first 500 of 501 rows");
  });
});
