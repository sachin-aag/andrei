import { Storage } from "@google-cloud/storage";
import { createWifAuthClient, getWifConfig, getWifAccessToken } from "@/lib/gcp/wif-token";

export const PDF_MIME_TYPE = "application/pdf";

export function gcsBucketName(): string {
  const bucket = process.env.GCS_BUCKET?.trim();
  if (!bucket) {
    throw new Error("GCS_BUCKET is not configured");
  }
  return bucket;
}

function getStorage(): Storage {
  const wifConfig = getWifConfig();
  if (wifConfig) {
    return new Storage({
      authClient: createWifAuthClient(wifConfig) as never,
    });
  }
  return new Storage();
}

async function getBearerToken(): Promise<string> {
  const wifConfig = getWifConfig();
  if (wifConfig) {
    return getWifAccessToken(wifConfig);
  }
  const storage = getStorage();
  const authClient = storage.authClient;
  if (!authClient) {
    throw new Error("GCS auth client is not configured");
  }
  const response: unknown = await authClient.getAccessToken();
  const token =
    typeof response === "string"
      ? response
      : response &&
          typeof response === "object" &&
          "token" in response &&
          typeof (response as { token?: string }).token === "string"
        ? (response as { token: string }).token
        : null;
  if (!token) {
    throw new Error("Failed to obtain GCS access token");
  }
  return token;
}

export function buildAttachmentObjectKey(
  reportId: string,
  attachmentId: string,
  filename: string
): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `reports/${reportId}/attachments/${attachmentId}/${sanitized}`;
}

/**
 * Start a resumable upload and return the session URI for direct browser PUT.
 * Avoids routing large PDF bytes through Vercel and works with WIF auth.
 */
export async function createResumableUploadUri(args: {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
}): Promise<string> {
  const bucket = gcsBucketName();
  const token = await getBearerToken();
  const initUrl = new URL(
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`
  );
  initUrl.searchParams.set("uploadType", "resumable");
  initUrl.searchParams.set("name", args.objectKey);

  const res = await fetch(initUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Type": args.contentType,
      "X-Upload-Content-Length": String(args.sizeBytes),
    },
    body: JSON.stringify({ contentType: args.contentType }),
  });

  if (!res.ok) {
    throw new Error(
      `GCS resumable upload init failed: ${res.status} ${await res.text()}`
    );
  }

  const location = res.headers.get("Location");
  if (!location) {
    throw new Error("GCS resumable upload init did not return a Location header");
  }
  return location;
}

export async function objectExists(objectKey: string): Promise<boolean> {
  const [exists] = await getStorage()
    .bucket(gcsBucketName())
    .file(objectKey)
    .exists();
  return exists;
}

export async function getObjectMetadata(objectKey: string): Promise<{
  sizeBytes: number;
  contentType: string | undefined;
}> {
  const [metadata] = await getStorage()
    .bucket(gcsBucketName())
    .file(objectKey)
    .getMetadata();
  return {
    sizeBytes: Number(metadata.size ?? 0),
    contentType: metadata.contentType,
  };
}

export async function deleteObject(objectKey: string): Promise<void> {
  await getStorage()
    .bucket(gcsBucketName())
    .file(objectKey)
    .delete({ ignoreNotFound: true });
}

export function readObjectStream(objectKey: string): NodeJS.ReadableStream {
  return getStorage().bucket(gcsBucketName()).file(objectKey).createReadStream();
}
