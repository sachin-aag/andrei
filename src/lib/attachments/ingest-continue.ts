import { createHmac, timingSafeEqual } from "node:crypto";

export const INGEST_CONTINUE_HEADER = "x-andrei-ingest-continue";
export const MAX_INGEST_CONTINUATIONS = 24;
const TOKEN_TTL_MS = 15 * 60 * 1000;

export type IngestContinuePayload = {
  attachmentId: string;
  generation: string;
  slice: number;
};

function continueSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET is required to continue document ingest");
  }
  return secret;
}

function signPayload(body: string): string {
  return createHmac("sha256", continueSecret()).update(body).digest("base64url");
}

function encodeToken(body: string, signature: string): string {
  return Buffer.from(`${body}.${signature}`, "utf8").toString("base64url");
}

function decodeToken(token: string): { body: string; signature: string } | null {
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const dot = decoded.lastIndexOf(".");
  if (dot <= 0) return null;
  return { body: decoded.slice(0, dot), signature: decoded.slice(dot + 1) };
}

export function mintIngestContinueToken(
  payload: IngestContinuePayload
): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const body = `${payload.attachmentId}:${payload.generation}:${payload.slice}:${exp}`;
  return encodeToken(body, signPayload(body));
}

export function verifyIngestContinueToken(
  token: string | null
): IngestContinuePayload | null {
  if (!token) return null;
  const parts = decodeToken(token);
  if (!parts) return null;
  let expected: string;
  try {
    expected = signPayload(parts.body);
  } catch {
    return null;
  }
  const provided = Buffer.from(parts.signature);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(provided, expectedBuf)) return null;

  const [attachmentId, generation, sliceRaw, expRaw] = parts.body.split(":");
  const slice = Number(sliceRaw);
  const exp = Number(expRaw);
  if (
    !attachmentId ||
    !generation ||
    !Number.isInteger(slice) ||
    slice < 1 ||
    !Number.isFinite(exp) ||
    exp < Date.now()
  ) {
    return null;
  }
  return { attachmentId, generation, slice };
}

/** Hit this deployment, not a custom production AUTH_URL. */
export function ingestContinueOrigin(): string {
  const vercelHost = process.env.VERCEL_URL?.trim();
  if (vercelHost) {
    return vercelHost.startsWith("http")
      ? vercelHost.replace(/\/$/, "")
      : `https://${vercelHost}`;
  }
  const authUrl = process.env.AUTH_URL?.trim().replace(/\/$/, "");
  if (authUrl) return authUrl;
  return "http://127.0.0.1:3000";
}

export function formatIngestPageLabel(
  page: number | null | undefined
): string | null {
  if (page == null || !Number.isInteger(page) || page < 1) return null;
  return `Page ${page}`;
}
