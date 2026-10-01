import { Storage } from "@google-cloud/storage";
import {
  assertCorpusAnchors,
  buildRetrievalCorpus,
  CORPUS_FILENAMES,
  RETRIEVAL_EVAL_GCS_PREFIX,
  type CorpusFile,
} from "./retrieval-corpus";

export function retrievalEvalGcsBucket(): string {
  const bucket =
    process.env.RETRIEVAL_EVAL_GCS_BUCKET?.trim() ||
    process.env.GCS_BUCKET?.trim();
  if (!bucket) {
    throw new Error(
      "Set RETRIEVAL_EVAL_GCS_BUCKET (or GCS_BUCKET) to the test corpus bucket."
    );
  }
  return bucket;
}

export function retrievalEvalGcsPrefix(): string {
  const prefix = process.env.RETRIEVAL_EVAL_GCS_PREFIX?.trim();
  if (!prefix) return RETRIEVAL_EVAL_GCS_PREFIX;
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function objectNameFor(filename: string): string {
  return `${retrievalEvalGcsPrefix()}${filename}`;
}

/** Laptop / ADC only. GitHub Actions `--from-gcs` never calls this. */
export async function uploadRetrievalCorpus(
  files: ReadonlyArray<{ filename: string; bytes: Buffer }>
): Promise<void> {
  const storage = new Storage();
  const bucket = storage.bucket(retrievalEvalGcsBucket());
  for (const file of files) {
    const objectName = objectNameFor(file.filename);
    await bucket.file(objectName).save(file.bytes, {
      contentType: "application/pdf",
      resumable: false,
    });
    console.log(`uploaded gs://${bucket.name}/${objectName}`);
  }
}

export type RetrievalCorpusIo = {
  listRelativeNames: () => Promise<string[]>;
  download: (filename: string) => Promise<Buffer>;
};

export function missingCorpusFilenames(
  listedRelativeNames: readonly string[]
): string[] {
  const listed = new Set(listedRelativeNames);
  return CORPUS_FILENAMES.filter((filename) => !listed.has(filename));
}

export class RetrievalEvalCorpusMissingError extends Error {
  readonly missing: string[];

  constructor(missing: readonly string[]) {
    super(
      `Retrieval eval corpus missing in GCS. Add objects with pnpm retrieval-eval:upload (laptop ADC, not CI). Missing: ${missing.join(", ")}`
    );
    this.name = "RetrievalEvalCorpusMissingError";
    this.missing = [...missing];
  }
}

async function downloadListedCorpus(
  io: RetrievalCorpusIo
): Promise<{ files: CorpusFile[]; missing: string[] }> {
  const missing = missingCorpusFilenames(await io.listRelativeNames());
  if (missing.length > 0) {
    return { files: [], missing };
  }
  const files: CorpusFile[] = [];
  for (const filename of CORPUS_FILENAMES) {
    files.push({ filename, bytes: await io.download(filename) });
  }
  return { files, missing: [] };
}

/**
 * CI path: download the bucket corpus. Never generate or upload.
 * Missing objects fail the job — add them with `pnpm retrieval-eval:upload`.
 * Stale bytes (gold anchors missing) are handled by
 * `selectRetrievalEvalCorpus` after download.
 */
export async function downloadGcsCorpus(
  io: RetrievalCorpusIo
): Promise<CorpusFile[]> {
  const listed = await downloadListedCorpus(io);
  if (listed.missing.length > 0) {
    throw new RetrievalEvalCorpusMissingError(listed.missing);
  }
  return listed.files;
}

function gcsCorpusIo(): RetrievalCorpusIo {
  const storage = new Storage();
  const bucket = storage.bucket(retrievalEvalGcsBucket());
  const prefix = retrievalEvalGcsPrefix();
  return {
    async listRelativeNames() {
      const [objects] = await bucket.getFiles({ prefix });
      return objects.map((file) => file.name.slice(prefix.length));
    },
    async download(filename) {
      const [bytes] = await bucket.file(`${prefix}${filename}`).download();
      return bytes;
    },
  };
}

export async function downloadRetrievalCorpus(): Promise<CorpusFile[]> {
  const listed = await downloadListedCorpus(gcsCorpusIo());
  if (listed.missing.length > 0) {
    const prefix = retrievalEvalGcsPrefix();
    const bucket = retrievalEvalGcsBucket();
    throw new RetrievalEvalCorpusMissingError(
      listed.missing.map((filename) => `gs://${bucket}/${prefix}${filename}`)
    );
  }
  return listed.files;
}

export type RetrievalEvalCorpusSource = "gcs" | "generated";

/**
 * Keep GCS bytes when they still carry gold anchors. If the bucket PDFs
 * predate a generator change (e.g. D1 slash IDs), generate locally.
 * Never upload — CI stays objectViewer-only.
 */
export async function selectRetrievalEvalCorpus(
  gcsFiles: readonly CorpusFile[],
  generate: () => Promise<CorpusFile[]> = buildRetrievalCorpus
): Promise<{ files: CorpusFile[]; source: RetrievalEvalCorpusSource }> {
  try {
    await assertCorpusAnchors(gcsFiles);
    return { files: [...gcsFiles], source: "gcs" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `retrieval eval GCS corpus is stale (${reason}). Using generated PDFs. Refresh with pnpm retrieval-eval:upload (laptop ADC, not CI).`
    );
    return { files: await generate(), source: "generated" };
  }
}

export async function loadRetrievalEvalCorpus(): Promise<CorpusFile[]> {
  const downloaded = await downloadRetrievalCorpus();
  const selected = await selectRetrievalEvalCorpus(downloaded);
  const label =
    selected.source === "gcs" ? "gcs" : "generated (gcs stale)";
  console.log(`retrieval eval corpus source=${label}`);
  return selected.files;
}
