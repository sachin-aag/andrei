import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_BATCH_BYTES,
  splitPdfIntoBatches,
} from "./pdf-split";
import { validatePdf } from "./validate-pdf";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "docs/sample_files/DEV-QC-25-010 Copy (1).pdf"
);

describe("DEV-QC-25-010 sample PDF fixture", () => {
  const buffer = readFileSync(FIXTURE_PATH);

  it("validates as a 74-page PDF under the default page limit", async () => {
    await expect(validatePdf(buffer, { maxPages: 500 })).resolves.toEqual({
      pageCount: 74,
    });
  });

  it("splits into contiguous batches covering every page", async () => {
    const split = await splitPdfIntoBatches(buffer);

    expect(split.pageCount).toBe(74);
    expect(split.batches).toHaveLength(25);
    expect(split.batches[0]).toMatchObject({ pageStart: 1, pageEnd: 3 });
    expect(split.batches.at(-1)).toMatchObject({ pageStart: 73, pageEnd: 74 });

    let expectedStart = 1;
    for (const batch of split.batches) {
      expect(batch.pageStart).toBe(expectedStart);
      expect(batch.pageEnd).toBeGreaterThanOrEqual(batch.pageStart);
      expect(batch.buffer.byteLength).toBeGreaterThan(0);
      expect(batch.buffer.byteLength).toBeLessThanOrEqual(DEFAULT_MAX_BATCH_BYTES);
      expectedStart = batch.pageEnd + 1;
    }
    expect(expectedStart).toBe(75);
  });
});
