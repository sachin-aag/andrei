import { describe, expect, it } from "vitest";
import { documentChunks, documentOutlineSpans, documentPages } from "@/db/schema";

describe("document_chunks schema", () => {
  it("declares a 768-dimension embedding column", () => {
    const embedding = documentChunks.embedding;
    expect(embedding.name).toBe("embedding");
    // drizzle-orm vector columns expose dimensions on the column config
    const dims =
      (embedding as { dimensions?: number }).dimensions ??
      (
        embedding as unknown as {
          config?: { dimensions?: number };
        }
      ).config?.dimensions;
    expect(dims).toBe(768);
  });
});

describe("document_pages retrieval columns", () => {
  it("declares identifiers, outline title, and nullable visual flags", () => {
    expect(documentPages.identifiers.name).toBe("identifiers");
    expect(documentPages.outlineTitle.name).toBe("outline_title");
    expect(documentPages.hasTable.name).toBe("has_table");
    expect(documentPages.hasFigure.name).toBe("has_figure");
  });
});

describe("document_outline_spans schema", () => {
  it("declares heading range columns", () => {
    expect(documentOutlineSpans.ordinal.name).toBe("ordinal");
    expect(documentOutlineSpans.pageStart.name).toBe("page_start");
    expect(documentOutlineSpans.pageEnd.name).toBe("page_end");
    expect(documentOutlineSpans.identifiers.name).toBe("identifiers");
  });
});
