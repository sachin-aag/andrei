import { describe, expect, it } from "vitest";
import { documentChunks } from "@/db/schema";

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
