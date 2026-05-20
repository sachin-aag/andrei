type LangfuseEnv = {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
};

export function readLangfuseEnv(): LangfuseEnv | null {
  const publicKey =
    process.env.LANGFUSE_PUBLIC_KEY?.trim() ??
    process.env.NEXT_PUBLIC_LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const baseUrl = (
    process.env.LANGFUSE_BASE_URL ??
    process.env.LANGFUSE_HOST ??
    "https://cloud.langfuse.com"
  )
    .trim()
    .replace(/\/$/, "");

  if (!publicKey || !secretKey) return null;
  return { publicKey, secretKey, baseUrl };
}

function authHeader(env: LangfuseEnv): string {
  const token = Buffer.from(`${env.publicKey}:${env.secretKey}`).toString(
    "base64"
  );
  return `Basic ${token}`;
}

export async function langfuseApiRequest<T = unknown>(params: {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}): Promise<T> {
  const env = readLangfuseEnv();
  if (!env) {
    throw new Error(
      "Langfuse credentials missing. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY in .env.local"
    );
  }

  const res = await fetch(`${env.baseUrl}${params.path}`, {
    method: params.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(env),
    },
    body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { raw: text };
    }
  }

  if (!res.ok) {
    const detail =
      typeof json === "object" && json !== null && "message" in json
        ? String((json as { message: unknown }).message)
        : text || res.statusText;
    throw new Error(`Langfuse API ${res.status} ${params.path}: ${detail}`);
  }

  return json as T;
}

export async function ensureLangfuseDataset(params: {
  name: string;
  description: string;
}): Promise<void> {
  try {
    await langfuseApiRequest({
      path: "/api/public/v2/datasets",
      method: "POST",
      body: {
        name: params.name,
        description: params.description,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already exists|duplicate|409/i.test(msg)) return;
    throw e;
  }
}

export async function upsertLangfuseDatasetItem(params: {
  datasetName: string;
  id: string;
  input: unknown;
  expectedOutput: unknown;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await langfuseApiRequest({
    path: "/api/public/dataset-items",
    method: "POST",
    body: {
      datasetName: params.datasetName,
      id: params.id,
      input: params.input,
      expectedOutput: params.expectedOutput,
      metadata: params.metadata,
      status: "ACTIVE",
    },
  });
}
