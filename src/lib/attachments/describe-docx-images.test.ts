import { type LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocxEmbeddedImage } from "@/lib/attachments/docx-images";

const generateTextMock = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

import { describeDocxImages } from "@/lib/attachments/describe-docx-images";

/** Distinct 1×1 PNG-shaped buffers so content-key dedupe does not collapse fixtures. */
function pngBytes(seed: number): Buffer {
  const base = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const copy = Buffer.from(base);
  copy[copy.length - 8] = (copy[copy.length - 8]! + seed) & 0xff;
  return copy;
}

function image(partial: Partial<DocxEmbeddedImage> & { ordinal: number }): DocxEmbeddedImage {
  return {
    bytes: pngBytes(partial.ordinal),
    mediaType: "image/png",
    filename: `image${partial.ordinal}.png`,
    charOffset: partial.ordinal * 10,
    nearbyText: "nearby context",
    altText: null,
    ...partial,
  };
}

function stubModel(): LanguageModel {
  return { modelId: "stub" } as LanguageModel;
}

describe("describeDocxImages", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
  });

  it("returns model descriptions keyed by ordinal", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        images: [
          { ordinal: 1, description: "HPLC chromatogram peak overlay." },
          { ordinal: 2, description: "Signed CAPA form stamp." },
        ],
      },
      text: "",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const result = await describeDocxImages({
      images: [image({ ordinal: 1 }), image({ ordinal: 2 })],
      filename: "evidence.docx",
      modelId: "gemini-test",
      model: stubModel(),
    });

    expect(result).toEqual([
      { ordinal: 1, description: "HPLC chromatogram peak overlay." },
      { ordinal: 2, description: "Signed CAPA form stamp." },
    ]);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to alt text when the model call fails", async () => {
    generateTextMock.mockRejectedValue(new Error("vertex unavailable"));

    const result = await describeDocxImages({
      images: [image({ ordinal: 1, altText: "Logo of MJ Biopharm" })],
      filename: "evidence.docx",
      modelId: "gemini-test",
      model: stubModel(),
    });

    expect(result).toEqual([
      { ordinal: 1, description: "Logo of MJ Biopharm" },
    ]);
  });

  it("batches images to keep prompt size bounded", async () => {
    generateTextMock.mockImplementation(async () => ({
      output: { images: [] },
      text: "",
    }));

    await describeDocxImages({
      images: [
        image({ ordinal: 1 }),
        image({ ordinal: 2 }),
        image({ ordinal: 3 }),
        image({ ordinal: 4 }),
        image({ ordinal: 5 }),
      ],
      filename: "evidence.docx",
      modelId: "gemini-test",
      model: stubModel(),
      batchSize: 2,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(3);
  });

  it("describes identical payloads once and reuses the text", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        images: [{ ordinal: 1, description: "Company letterhead logo." }],
      },
      text: "",
    });

    const shared = pngBytes(9);
    const result = await describeDocxImages({
      images: [
        image({ ordinal: 1, bytes: shared }),
        image({ ordinal: 2, bytes: shared }),
      ],
      filename: "evidence.docx",
      modelId: "gemini-test",
      model: stubModel(),
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { ordinal: 1, description: "Company letterhead logo." },
      { ordinal: 2, description: "Company letterhead logo." },
    ]);
  });
});
