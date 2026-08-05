import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { Storage } from "@google-cloud/storage";
import { createId } from "@paralleldrive/cuid2";
import { createWifAuthClient, getWifConfig } from "@/lib/gcp/wif-token";

export type CreateResumableUploadInput = {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  /**
   * Browser Origin that will PUT chunks. Required for GCS resumable uploads
   * initiated server-side — without it, PUT responses omit ACAO and the
   * browser treats a successful upload as a network failure (stuck "uploading").
   */
  origin?: string | null;
};

export type ObjectMetadata = {
  sizeBytes: number;
  contentType: string;
  generation: string;
  crc32c: string;
};

export type SignedReadUrlInput = {
  objectKey: string;
  generation: string;
  expiresInSeconds: number;
  /** When set, GCS returns Content-Disposition: attachment for browser download. */
  downloadFilename?: string;
};

export interface AttachmentStorage {
  createResumableUpload(input: CreateResumableUploadInput): Promise<string>;
  getObjectMetadata(objectKey: string): Promise<ObjectMetadata>;
  readObjectBuffer(objectKey: string): Promise<Buffer>;
  /** Stream object bytes (preferred for large PDF preview/download on Vercel). */
  openObjectReadStream(objectKey: string): Promise<ReadableStream<Uint8Array>>;
  writeObjectBuffer(
    objectKey: string,
    buffer: Buffer,
    contentType: string
  ): Promise<void>;
  copyObject(fromKey: string, toKey: string): Promise<void>;
  deleteObject(objectKey: string): Promise<void>;
  getSignedReadUrl(input: SignedReadUrlInput): Promise<string>;
}

type LocalUploadSession = {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  receivedBytes: number;
};

const LOCAL_STORAGE_ROOT = path.join(process.cwd(), ".data", "attachments");
const LOCAL_UPLOAD_SESSIONS_ROOT = path.join(LOCAL_STORAGE_ROOT, "_sessions");
const LOCAL_UPLOAD_PARTS_ROOT = path.join(LOCAL_STORAGE_ROOT, "_parts");

let cachedStorage: AttachmentStorage | null = null;

/**
 * Local disk backend for Playwright / local-only runs.
 * Gated by explicit dual env flags — never by NODE_ENV alone — so CI can use
 * `next start` (NODE_ENV=production) with ATTACHMENT_STORAGE_BACKEND=local.
 * Do not set these flags on Vercel production or preview.
 */
export function isLocalAttachmentStorageEnabled(): boolean {
  return (
    process.env.ATTACHMENT_STORAGE_BACKEND?.trim() === "local" &&
    process.env.ALLOW_LOCAL_ATTACHMENT_STORAGE === "true"
  );
}

export function stagingObjectKey(attachmentId: string): string {
  return `staging/attachments/${attachmentId}/source.pdf`;
}

export function permanentObjectKey(
  reportId: string,
  attachmentId: string
): string {
  return `reports/${reportId}/attachments/${attachmentId}/source.pdf`;
}

export function tempBatchObjectKey(
  attachmentId: string,
  runId: string,
  batchIndex: number
): string {
  return `temp/attachments/${attachmentId}/ingest-runs/${runId}/batches/${batchIndex}.pdf`;
}

export function getAttachmentStorage(): AttachmentStorage {
  if (cachedStorage) return cachedStorage;

  cachedStorage = isLocalAttachmentStorageEnabled()
    ? new LocalAttachmentStorage()
    : new GcsAttachmentStorage(requiredGcsBucket());
  return cachedStorage;
}

export function getAttachmentStorageBucketName(): string {
  if (isLocalAttachmentStorageEnabled()) {
    return "local-attachment-storage";
  }
  return requiredGcsBucket();
}

export function resetAttachmentStorageForTests(): void {
  cachedStorage = null;
}

/**
 * Local read URLs are bearer-style query params. Bind key + generation +
 * expiresAt with an HMAC so recipients cannot extend lifetime by editing
 * expiresAt alone.
 */
function localReadSigningSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is required to sign local attachment read URLs"
    );
  }
  return secret;
}

function localReadSignaturePayload(
  objectKey: string,
  generation: string,
  expiresAt: number
): string {
  return `${objectKey}\n${generation}\n${expiresAt}`;
}

export function signLocalReadUrlParams(
  objectKey: string,
  generation: string,
  expiresAt: number
): string {
  return createHmac("sha256", localReadSigningSecret())
    .update(localReadSignaturePayload(objectKey, generation, expiresAt))
    .digest("base64url");
}

export function verifyLocalReadUrlParams(
  objectKey: string,
  generation: string,
  expiresAt: number,
  signature: string | null
): boolean {
  if (!signature) return false;
  let expected: string;
  try {
    expected = signLocalReadUrlParams(objectKey, generation, expiresAt);
  } catch {
    return false;
  }
  const provided = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length) return false;
  return timingSafeEqual(provided, expectedBuf);
}

export class GcsAttachmentStorage implements AttachmentStorage {
  private readonly storage: Storage;
  private readonly wifConfig = getWifConfig();

  constructor(private readonly bucketName: string) {
    this.storage = this.wifConfig
      ? new Storage({
          authClient: createWifAuthClient(this.wifConfig) as never,
          // Lets GoogleAuth.getCredentials resolve client_email for signBlob.
          credentials: { client_email: this.wifConfig.serviceAccountEmail },
          projectId: process.env.GOOGLE_VERTEX_PROJECT?.trim() || undefined,
        })
      : new Storage();
  }

  async createResumableUpload({
    objectKey,
    contentType,
    sizeBytes,
    origin,
  }: CreateResumableUploadInput): Promise<string> {
    const file = this.file(objectKey);
    const [uploadUrl] = await file.createResumableUpload({
      ...(origin ? { origin } : {}),
      metadata: {
        contentType,
        metadata: {
          expectedSizeBytes: String(sizeBytes),
        },
      },
      preconditionOpts: {
        ifGenerationMatch: 0,
      },
    });
    return uploadUrl;
  }

  async getObjectMetadata(objectKey: string): Promise<ObjectMetadata> {
    const [metadata] = await this.file(objectKey).getMetadata();
    return {
      sizeBytes: Number(metadata.size ?? 0),
      contentType: metadata.contentType ?? "application/octet-stream",
      generation: String(metadata.generation ?? ""),
      crc32c: String(metadata.crc32c ?? ""),
    };
  }

  async readObjectBuffer(objectKey: string): Promise<Buffer> {
    const [buffer] = await this.file(objectKey).download();
    return buffer;
  }

  async openObjectReadStream(
    objectKey: string
  ): Promise<ReadableStream<Uint8Array>> {
    const nodeStream = this.file(objectKey).createReadStream();
    return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  }

  async writeObjectBuffer(
    objectKey: string,
    buffer: Buffer,
    contentType: string
  ): Promise<void> {
    await this.file(objectKey).save(buffer, {
      contentType,
      resumable: false,
      preconditionOpts: {
        ifGenerationMatch: 0,
      },
    });
  }

  async copyObject(fromKey: string, toKey: string): Promise<void> {
    await this.file(fromKey).copy(this.file(toKey), {
      preconditionOpts: {
        ifGenerationMatch: 0,
      },
    });
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.file(objectKey).delete({ ignoreNotFound: true });
  }

  async getSignedReadUrl({
    objectKey,
    generation,
    expiresInSeconds,
    downloadFilename,
  }: SignedReadUrlInput): Promise<string> {
    if (this.wifConfig) {
      return signedGcsReadUrlWithWif({
        bucketName: this.bucketName,
        objectKey,
        generation,
        expiresInSeconds,
        downloadFilename,
        serviceAccountEmail: this.wifConfig.serviceAccountEmail,
        sign: createWifAuthClient(this.wifConfig).sign,
      });
    }

    const expires = Date.now() + expiresInSeconds * 1000;
    const [url] = await this.file(objectKey).getSignedUrl({
      action: "read",
      expires,
      version: "v4",
      extensionHeaders: {},
      queryParams: {
        generation,
      },
      responseType: "application/pdf",
      ...(downloadFilename
        ? {
            responseDisposition: contentDispositionAttachment(downloadFilename),
          }
        : {}),
    });
    return url;
  }

  private file(objectKey: string) {
    return this.storage.bucket(this.bucketName).file(objectKey);
  }
}

export class LocalAttachmentStorage implements AttachmentStorage {
  async createResumableUpload({
    objectKey,
    contentType,
    sizeBytes,
  }: CreateResumableUploadInput): Promise<string> {
    const sessionId = createId();
    await ensureLocalDirs();
    const session: LocalUploadSession = {
      objectKey,
      contentType,
      sizeBytes,
      receivedBytes: 0,
    };
    await writeLocalUploadSession(sessionId, session);
    return `/api/attachments/local-upload/${sessionId}`;
  }

  async getObjectMetadata(objectKey: string): Promise<ObjectMetadata> {
    const metadata = await readLocalObjectMetadata(objectKey);
    const fileStat = await stat(localObjectPath(objectKey));
    return {
      ...metadata,
      sizeBytes: fileStat.size,
    };
  }

  async readObjectBuffer(objectKey: string): Promise<Buffer> {
    return readFile(localObjectPath(objectKey));
  }

  async openObjectReadStream(
    objectKey: string
  ): Promise<ReadableStream<Uint8Array>> {
    const nodeStream = createReadStream(localObjectPath(objectKey));
    return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  }

  async writeObjectBuffer(
    objectKey: string,
    buffer: Buffer,
    contentType: string
  ): Promise<void> {
    const objectPath = localObjectPath(objectKey);
    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, buffer);
    await writeLocalObjectMetadata(objectKey, buffer, contentType);
  }

  async copyObject(fromKey: string, toKey: string): Promise<void> {
    const buffer = await this.readObjectBuffer(fromKey);
    const metadata = await this.getObjectMetadata(fromKey);
    await this.writeObjectBuffer(toKey, buffer, metadata.contentType);
  }

  async deleteObject(objectKey: string): Promise<void> {
    await rm(localObjectPath(objectKey), { force: true });
    await rm(localMetadataPath(objectKey), { force: true });
  }

  async getSignedReadUrl({
    objectKey,
    generation,
    expiresInSeconds,
    downloadFilename,
  }: SignedReadUrlInput): Promise<string> {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const params = new URLSearchParams({
      key: objectKey,
      generation,
      expiresAt: String(expiresAt),
      sig: signLocalReadUrlParams(objectKey, generation, expiresAt),
    });
    if (downloadFilename) {
      params.set("download", "1");
      params.set("filename", downloadFilename);
    }
    return `/api/attachments/local-read?${params.toString()}`;
  }
}

function contentDispositionAttachment(filename: string): string {
  const safe = filename.replace(/["\r\n]/g, "_");
  return `attachment; filename="${safe}"`;
}

async function signedGcsReadUrlWithWif({
  bucketName,
  objectKey,
  generation,
  expiresInSeconds,
  downloadFilename,
  serviceAccountEmail,
  sign,
}: {
  bucketName: string;
  objectKey: string;
  generation: string;
  expiresInSeconds: number;
  downloadFilename?: string;
  serviceAccountEmail: string;
  sign: (data: string) => Promise<string>;
}): Promise<string> {
  const now = new Date();
  const datestamp = formatGcsDate(now);
  const timestamp = formatGcsTimestamp(now);
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${serviceAccountEmail}/${credentialScope}`;
  const host = "storage.googleapis.com";
  const canonicalUri = `/${bucketName}/${encodeGcsPath(objectKey)}`;
  const signedHeaders = "host";
  const queryParams: Record<string, string> = {
    "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
    "X-Goog-Credential": credential,
    "X-Goog-Date": timestamp,
    "X-Goog-Expires": String(expiresInSeconds),
    "X-Goog-SignedHeaders": signedHeaders,
    generation,
    "response-content-type": "application/pdf",
  };

  if (downloadFilename) {
    queryParams["response-content-disposition"] =
      contentDispositionAttachment(downloadFilename);
  }

  const canonicalQuery = canonicalQueryString(queryParams);
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "GOOG4-RSA-SHA256",
    timestamp,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const signature = Buffer.from(await sign(stringToSign), "base64").toString(
    "hex"
  );

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${signature}`;
}

/**
 * GOOG4 requires the encoded params sorted by byte value, not by locale
 * collation — `localeCompare` is case-insensitive and would order
 * `generation` before `X-Goog-*`, which GCS rejects as a signature mismatch.
 */
function canonicalQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .join("&");
}

function encodeGcsPath(pathname: string): string {
  return pathname.split("/").map(encodeRfc3986).join("/");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function formatGcsDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function formatGcsTimestamp(date: Date): string {
  return `${formatGcsDate(date)}T${date
    .toISOString()
    .slice(11, 19)
    .replaceAll(":", "")}Z`;
}

export async function appendLocalUploadChunk(
  sessionId: string,
  chunk: Buffer,
  contentRange: string | null
): Promise<{ complete: boolean; receivedBytes: number }> {
  const session = await readLocalUploadSession(sessionId);
  const range = parseContentRange(contentRange);
  assertLocalUploadRangeWithinTotal({
    start: range.start,
    end: range.end,
    total: range.total,
    chunkByteLength: chunk.byteLength,
    receivedBytes: session.receivedBytes,
    reservedSizeBytes: session.sizeBytes,
  });
  if (range.start !== session.receivedBytes) {
    return { complete: false, receivedBytes: session.receivedBytes };
  }

  await ensureLocalDirs();
  const partPath = localUploadPartPath(sessionId);
  const prior = session.receivedBytes === 0 ? Buffer.alloc(0) : await readFile(partPath);
  await writeFile(partPath, Buffer.concat([prior, chunk]));

  const receivedBytes = range.end + 1;
  const nextSession = { ...session, receivedBytes };
  await writeLocalUploadSession(sessionId, nextSession);
  if (receivedBytes !== session.sizeBytes) {
    return { complete: false, receivedBytes };
  }

  const objectPath = localObjectPath(session.objectKey);
  await mkdir(path.dirname(objectPath), { recursive: true });
  await rename(partPath, objectPath);
  const buffer = await readFile(objectPath);
  await writeLocalObjectMetadata(session.objectKey, buffer, session.contentType);
  await rm(localUploadSessionPath(sessionId), { force: true });
  return { complete: true, receivedBytes };
}

function requiredGcsBucket(): string {
  const bucket = process.env.GCS_BUCKET?.trim();
  if (!bucket) {
    throw new Error(
      "GCS_BUCKET is required unless local attachment storage is explicitly enabled."
    );
  }
  return bucket;
}

async function ensureLocalDirs(): Promise<void> {
  await Promise.all([
    mkdir(LOCAL_STORAGE_ROOT, { recursive: true }),
    mkdir(LOCAL_UPLOAD_SESSIONS_ROOT, { recursive: true }),
    mkdir(LOCAL_UPLOAD_PARTS_ROOT, { recursive: true }),
  ]);
}

function localObjectPath(objectKey: string): string {
  const segments = safeObjectKeySegments(objectKey);
  return path.join(LOCAL_STORAGE_ROOT, "objects", ...segments);
}

function localMetadataPath(objectKey: string): string {
  return `${localObjectPath(objectKey)}.metadata.json`;
}

function localUploadSessionPath(sessionId: string): string {
  return path.join(LOCAL_UPLOAD_SESSIONS_ROOT, `${sessionId}.json`);
}

function localUploadPartPath(sessionId: string): string {
  return path.join(LOCAL_UPLOAD_PARTS_ROOT, `${sessionId}.part`);
}

function safeObjectKeySegments(objectKey: string): string[] {
  if (objectKey.startsWith("/") || objectKey.includes("\\")) {
    throw new Error("Invalid object key");
  }
  const segments = objectKey.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Invalid object key");
  }
  return segments;
}

async function writeLocalObjectMetadata(
  objectKey: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const metadataPath = localMetadataPath(objectKey);
  await mkdir(path.dirname(metadataPath), { recursive: true });
  const hash = createHash("sha256").update(buffer).digest("hex");
  const metadata: ObjectMetadata = {
    sizeBytes: buffer.byteLength,
    contentType,
    generation: String(Date.now()),
    crc32c: `local-${hash.slice(0, 16)}`,
  };
  await writeFile(metadataPath, JSON.stringify(metadata), "utf8");
}

async function readLocalObjectMetadata(objectKey: string): Promise<ObjectMetadata> {
  const raw = await readFile(localMetadataPath(objectKey), "utf8");
  return JSON.parse(raw) as ObjectMetadata;
}

async function writeLocalUploadSession(
  sessionId: string,
  session: LocalUploadSession
): Promise<void> {
  await ensureLocalDirs();
  await writeFile(
    localUploadSessionPath(sessionId),
    JSON.stringify(session),
    "utf8"
  );
}

async function readLocalUploadSession(
  sessionId: string
): Promise<LocalUploadSession> {
  const raw = await readFile(localUploadSessionPath(sessionId), "utf8");
  return JSON.parse(raw) as LocalUploadSession;
}

function parseContentRange(header: string | null): {
  start: number;
  end: number;
  total: number;
} {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header ?? "");
  if (!match) throw new Error("Missing or invalid Content-Range");
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    total: Number(match[3]),
  };
}

/** Exported for unit tests of Content-Range bounds checks. */
export function assertLocalUploadRangeWithinTotal(input: {
  start: number;
  end: number;
  total: number;
  chunkByteLength: number;
  receivedBytes: number;
  reservedSizeBytes: number;
}): void {
  if (input.total !== input.reservedSizeBytes) {
    throw new Error("Upload size does not match reserved size");
  }
  if (input.end < input.start) {
    throw new Error("Invalid Content-Range");
  }
  if (input.end >= input.total || input.start >= input.total) {
    throw new Error("Content-Range exceeds declared total");
  }
  const chunkLength = input.end - input.start + 1;
  if (input.chunkByteLength !== chunkLength) {
    throw new Error("Chunk size does not match Content-Range");
  }
  if (input.receivedBytes + input.chunkByteLength > input.reservedSizeBytes) {
    throw new Error("Chunk would exceed reserved upload size");
  }
}
