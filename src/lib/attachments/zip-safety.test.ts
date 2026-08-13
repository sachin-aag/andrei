import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  assertZipSafetyLimits,
  DEFAULT_DOCX_ZIP_SAFETY_LIMITS,
  listZipCentralDirectory,
} from "@/lib/attachments/zip-safety";
import { validateDocx } from "@/lib/attachments/validate-docx";

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

/** Minimal single-entry DEFLATE zip with caller-controlled size fields. */
function craftDocxZip(opts: {
  fileName?: string;
  uncompressedSize: number;
  payload: Buffer;
}): Buffer {
  const fileName = Buffer.from(opts.fileName ?? "word/document.xml", "utf8");
  const compressed = deflateRawSync(opts.payload);
  const compressionMethod = 8;
  const crc = 0;

  const local = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0),
    u16(compressionMethod),
    u16(0),
    u16(0),
    u32(crc),
    u32(compressed.length),
    u32(opts.uncompressedSize),
    u16(fileName.length),
    u16(0),
    fileName,
    compressed,
  ]);

  const central = Buffer.concat([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(0),
    u16(compressionMethod),
    u16(0),
    u16(0),
    u32(crc),
    u32(compressed.length),
    u32(opts.uncompressedSize),
    u16(fileName.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    fileName,
  ]);

  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(1),
    u16(1),
    u32(central.length),
    u32(local.length),
    u16(0),
  ]);

  return Buffer.concat([local, central, eocd]);
}

describe("listZipCentralDirectory / assertZipSafetyLimits", () => {
  it("parses a crafted docx-shaped zip", () => {
    const zip = craftDocxZip({
      uncompressedSize: 4,
      payload: Buffer.from("abcd"),
    });
    const entries = listZipCentralDirectory(zip);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.fileName).toBe("word/document.xml");
    expect(entries[0]?.uncompressedSize).toBe(4);
  });

  it("rejects when total uncompressed size exceeds the limit", () => {
    expect(() =>
      assertZipSafetyLimits(
        [
          {
            fileName: "a.xml",
            compressedSize: 10 * 1024 * 1024,
            uncompressedSize: 90 * 1024 * 1024,
            compressionMethod: 8,
            localHeaderOffset: 0,
          },
          {
            fileName: "b.xml",
            compressedSize: 10 * 1024 * 1024,
            uncompressedSize: 90 * 1024 * 1024,
            compressionMethod: 8,
            localHeaderOffset: 0,
          },
          {
            fileName: "c.xml",
            compressedSize: 10 * 1024 * 1024,
            uncompressedSize: 90 * 1024 * 1024,
            compressionMethod: 8,
            localHeaderOffset: 0,
          },
        ],
        DEFAULT_DOCX_ZIP_SAFETY_LIMITS
      )
    ).toThrow(/uncompressed size exceeds/i);
  });

  it("rejects a high compression ratio on large entries", () => {
    expect(() =>
      assertZipSafetyLimits([
        {
          fileName: "bomb.xml",
          compressedSize: 1_000,
          uncompressedSize: 50 * 1024 * 1024,
          compressionMethod: 8,
          localHeaderOffset: 0,
        },
      ])
    ).toThrow(/compression ratio/i);
  });

  it("rejects too many entries", () => {
    const entries = Array.from({ length: 10_001 }, (_, i) => ({
      fileName: `f${i}.xml`,
      compressedSize: 1,
      uncompressedSize: 1,
      compressionMethod: 0,
      localHeaderOffset: 0,
    }));
    expect(() => assertZipSafetyLimits(entries)).toThrow(/too many/i);
  });
});

describe("validateDocx zip-bomb guards", () => {
  it("rejects a zip whose central directory claims a huge uncompressed size", () => {
    const zip = craftDocxZip({
      // Claim ~300MB while payload is tiny — classic zip-bomb metadata.
      uncompressedSize: 300 * 1024 * 1024,
      payload: Buffer.from("<?xml version='1.0'?><w:document/>"),
    });
    expect(() => validateDocx(zip)).toThrow(/oversized|uncompressed|ratio/i);
  });

  it("rejects a zip whose document part inflates past the declared size cap", () => {
    // Central directory claims a tiny uncompressed size; payload expands far more.
    const payload = Buffer.alloc(32 * 1024, 0x61);
    const zip = craftDocxZip({
      uncompressedSize: 64,
      payload,
    });
    expect(() =>
      validateDocx(zip, {
        zipLimits: {
          ...DEFAULT_DOCX_ZIP_SAFETY_LIMITS,
          // Allow the forged declared size through the metadata checks.
          maxCompressionRatio: 10_000,
          ratioMinUncompressedBytes: 10 * 1024 * 1024,
        },
      })
    ).toThrow(/oversized or corrupt/i);
  });
});
