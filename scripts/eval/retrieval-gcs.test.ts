import { afterEach, describe, expect, it, vi } from "vitest";
import {
  missingCorpusFilenames,
  resolveGcsCorpus,
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

function memoryCorpusIo(initial: Record<string, Buffer> = {}): {
  io: RetrievalCorpusIo;
  store: Map<string, Buffer>;
} {
  const store = new Map(Object.entries(initial));
  const generated = CORPUS_FILENAMES.map((filename) => ({
    filename,
    bytes: fakePdf(`generated:${filename}`),
  }));
  const io: RetrievalCorpusIo = {
    listRelativeNames: async () => [...store.keys()],
    download: async (filename) => {
      const bytes = store.get(filename);
      if (!bytes) throw new Error(`missing ${filename}`);
      return bytes;
    },
    upload: async (files) => {
      for (const file of files) store.set(file.filename, file.bytes);
    },
    generate: async () => generated,
  };
  return { io, store };
}

describe("resolveGcsCorpus", () => {
  it("reports which corpus filenames are missing", () => {
    expect(missingCorpusFilenames([])).toEqual([...CORPUS_FILENAMES]);
    expect(missingCorpusFilenames([CORPUS_FILENAMES[0]])).toEqual([
      CORPUS_FILENAMES[1],
    ]);
    expect(missingCorpusFilenames([...CORPUS_FILENAMES])).toEqual([]);
  });

  it("downloads when every corpus object is already in GCS", async () => {
    const { io } = memoryCorpusIo({
      [CORPUS_FILENAMES[0]]: fakePdf("gcs-a"),
      [CORPUS_FILENAMES[1]]: fakePdf("gcs-b"),
    });
    const resolved = await resolveGcsCorpus(io);
    expect(resolved.source).toBe("gcs");
    expect(resolved.files.map((file) => file.bytes.toString())).toEqual([
      "pdf:gcs-a",
      "pdf:gcs-b",
    ]);
  });

  it("seeds GCS and re-downloads when objects are missing", async () => {
    const { io, store } = memoryCorpusIo();
    const resolved = await resolveGcsCorpus(io);
    expect(resolved.source).toBe("seeded");
    expect([...store.keys()]).toEqual([...CORPUS_FILENAMES]);
    expect(resolved.files).toHaveLength(CORPUS_FILENAMES.length);
  });

  it("falls back to generated PDFs when upload is denied", async () => {
    const io: RetrievalCorpusIo = {
      listRelativeNames: async () => [],
      download: async () => {
        throw new Error("should not download");
      },
      upload: async () => {
        throw new Error("Permission 'storage.objects.create' denied");
      },
      generate: async () =>
        CORPUS_FILENAMES.map((filename) => ({
          filename,
          bytes: fakePdf(`generated:${filename}`),
        })),
    };
    const resolved = await resolveGcsCorpus(io);
    expect(resolved.source).toBe("generated");
    expect(resolved.files[0]?.bytes.toString()).toBe(
      `pdf:generated:${CORPUS_FILENAMES[0]}`
    );
  });
});
