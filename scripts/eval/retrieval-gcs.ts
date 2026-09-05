import { Storage } from "@google-cloud/storage";
import {
  CORPUS_FILENAMES,
  RETRIEVAL_EVAL_GCS_PREFIX,
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

export async function downloadRetrievalCorpus(): Promise<
  Array<{ filename: string; bytes: Buffer }>
> {
  const storage = new Storage();
  const bucket = storage.bucket(retrievalEvalGcsBucket());
  const prefix = retrievalEvalGcsPrefix();
  const [objects] = await bucket.getFiles({ prefix });
  const byName = new Map(
    objects.map((file) => [file.name.slice(prefix.length), file])
  );

  const missing: string[] = [];
  const files: Array<{ filename: string; bytes: Buffer }> = [];
  for (const filename of CORPUS_FILENAMES) {
    const object = byName.get(filename);
    if (!object) {
      missing.push(`gs://${bucket.name}/${prefix}${filename}`);
      continue;
    }
    const [bytes] = await object.download();
    files.push({ filename, bytes });
  }
  if (missing.length > 0) {
    throw new Error(
      `Retrieval eval corpus missing in GCS. Run pnpm retrieval-eval:upload. Missing: ${missing.join(", ")}`
    );
  }
  return files;
}
