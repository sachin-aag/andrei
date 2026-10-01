import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadGcsCorpus,
  missingCorpusFilenames,
  RetrievalEvalCorpusMissingError,
  retrievalEvalGcsBucket,
  retrievalEvalGcsPrefix,
  selectRetrievalEvalCorpus,
  type RetrievalCorpusIo,
} from "./retrieval-gcs";
import {
  assertCorpusAnchors,
  buildRetrievalCorpus,
  CORPUS_ANCHORS,
  CORPUS_FILENAMES,
  PROTOCOL_EQUIPMENT_FILENAME,
  RETRIEVAL_EVAL_GCS_PREFIX,
  SOFTWARE_REQUIREMENTS_FILENAME,
} from "./retrieval-corpus";

describe("retrieval eval GCS helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers RETRIEVAL_EVAL_GCS_BUCKET over GCS_BUCKET", () => {
    vi.stubEnv("RETRIEVAL_EVAL_GCS_BUCKET", "eval-bucket");
    vi.stubEnv("GCS_BUCKET", "prod-bucket");
    expect(retrievalEvalGcsBucket()).toBe("eval-bucket");
  });

  it("falls back to GCS_BUCKET", () => {
    vi.stubEnv("RETRIEVAL_EVAL_GCS_BUCKET", "");
    vi.stubEnv("GCS_BUCKET", "prod-bucket");
    expect(retrievalEvalGcsBucket()).toBe("prod-bucket");
  });

  it("throws when neither bucket is set", () => {
    vi.stubEnv("RETRIEVAL_EVAL_GCS_BUCKET", "");
    vi.stubEnv("GCS_BUCKET", "");
    expect(() => retrievalEvalGcsBucket()).toThrow(/RETRIEVAL_EVAL_GCS_BUCKET/);
  });

  it("defaults the prefix and normalizes a trailing slash", () => {
    vi.stubEnv("RETRIEVAL_EVAL_GCS_PREFIX", "");
    expect(retrievalEvalGcsPrefix()).toBe(RETRIEVAL_EVAL_GCS_PREFIX);
    vi.stubEnv("RETRIEVAL_EVAL_GCS_PREFIX", "custom-prefix");
    expect(retrievalEvalGcsPrefix()).toBe("custom-prefix/");
  });
});

function fakePdf(label: string): Buffer {
  return Buffer.from(`pdf:${label}`);
}

function memoryCorpusIo(initial: Record<string, Buffer> = {}): RetrievalCorpusIo {
  const store = new Map(Object.entries(initial));
  return {
    listRelativeNames: async () => [...store.keys()],
    download: async (filename) => {
      const bytes = store.get(filename);
      if (!bytes) throw new Error(`missing ${filename}`);
      return bytes;
    },
  };
}

/** Bucket PDFs from before D1: SW-EVAL-7 is present, slash IDs are not. */
async function softwarePdfBeforeSlashIds(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const cover = doc.addPage([612, 792]);
  let y = 740;
  for (const line of [
    "Software Requirements Specification",
    "Eval corpus document — not a customer record",
    "This cover page has no requirement identifiers.",
    "The equipment. A system. This report. Cover only — not a data table.",
    "Revision A. Product: retrieval eval corpus. Controlled copy for search tests only.",
    "Do not cite this cover as containing SW-EVAL-7 or any equipment table.",
  ]) {
    cover.drawText(line, { x: 48, y, size: 11, font });
    y -= 14;
  }
  const table = doc.addPage([612, 792]);
  y = 740;
  for (const line of [
    "TABLE SOFTWARE REQUIREMENTS",
    "ID / Description / Result",
    `${CORPUS_ANCHORS.swEval7} ${CORPUS_ANCHORS.interlock} Pass`,
    "SW-EVAL-8 Waveform buffer depth Pass",
    "SW-EVAL-9 Footswitch debounce Pass",
    "SW-EVAL-10 Display brightness ramp Pass",
    "SW-EVAL-11 Emergency stop latch Pass",
    "SW-EVAL-12 Cooling fan watchdog Pass",
  ]) {
    table.drawText(line, { x: 48, y, size: 11, font });
    y -= 14;
  }
  return Buffer.from(await doc.save());
}

describe("downloadGcsCorpus", () => {
  it("reports which corpus filenames are missing", () => {
    expect(missingCorpusFilenames([])).toEqual([...CORPUS_FILENAMES]);
    expect(missingCorpusFilenames([CORPUS_FILENAMES[0]])).toEqual([
      CORPUS_FILENAMES[1],
    ]);
    expect(missingCorpusFilenames([...CORPUS_FILENAMES])).toEqual([]);
  });

  it("downloads when every corpus object is already in GCS", async () => {
    const io = memoryCorpusIo({
      [CORPUS_FILENAMES[0]]: fakePdf("gcs-a"),
      [CORPUS_FILENAMES[1]]: fakePdf("gcs-b"),
    });
    const files = await downloadGcsCorpus(io);
    expect(files.map((file) => file.bytes.toString())).toEqual([
      "pdf:gcs-a",
      "pdf:gcs-b",
    ]);
  });

  it("fails instead of uploading when objects are missing", async () => {
    const io = memoryCorpusIo();
    await expect(downloadGcsCorpus(io)).rejects.toBeInstanceOf(
      RetrievalEvalCorpusMissingError
    );
  });
});

describe("selectRetrievalEvalCorpus", () => {
  it("keeps GCS bytes when gold anchors are present", async () => {
    const gcsFiles = await buildRetrievalCorpus();
    const selected = await selectRetrievalEvalCorpus(gcsFiles, async () => {
      throw new Error("should not generate when GCS anchors pass");
    });
    expect(selected.source).toBe("gcs");
    expect(selected.files).toEqual(gcsFiles);
  });

  it("generates locally when GCS PDFs predate gold slash-ID anchors", async () => {
    const generated = await buildRetrievalCorpus();
    const protocol = generated.find(
      (file) => file.filename === PROTOCOL_EQUIPMENT_FILENAME
    );
    expect(protocol).toBeDefined();
    const staleGcs = [
      protocol!,
      {
        filename: SOFTWARE_REQUIREMENTS_FILENAME,
        bytes: await softwarePdfBeforeSlashIds(),
      },
    ];
    await expect(assertCorpusAnchors(staleGcs)).rejects.toThrow(
      /software p\.2 is missing "PMC\/PR\/014"/
    );

    const selected = await selectRetrievalEvalCorpus(
      staleGcs,
      async () => generated
    );
    expect(selected.source).toBe("generated");
    expect(selected.files).toBe(generated);
    await expect(assertCorpusAnchors(selected.files)).resolves.toBeUndefined();
  });
});
