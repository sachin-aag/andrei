import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadGcsCorpus,
  missingCorpusFilenames,
  RetrievalEvalCorpusMissingError,
  retrievalEvalGcsBucket,
  retrievalEvalGcsPrefix,
  type RetrievalCorpusIo,
} from "./retrieval-gcs";
import {
  CORPUS_FILENAMES,
  RETRIEVAL_EVAL_GCS_PREFIX,
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
