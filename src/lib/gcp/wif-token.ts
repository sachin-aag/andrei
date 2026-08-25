import { getVercelOidcToken as readVercelOidcToken } from "@vercel/oidc";

/**
 * Workload Identity Federation: exchange Vercel OIDC token for a
 * cloud-platform-scoped Google access token via STS + service account impersonation.
 */

export type WifConfig = {
  audience: string;
  serviceAccountEmail: string;
};

export function getWifConfig(): WifConfig | null {
  const audience = process.env.GCP_WIF_AUDIENCE?.trim();
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL?.trim();
  if (!audience || !serviceAccountEmail) return null;
  return { audience, serviceAccountEmail };
}

/**
 * Per-invocation Vercel OIDC token for WIF.
 *
 * Prefer `@vercel/oidc` (request-context `x-vercel-oidc-token`, with refresh)
 * over `process.env.VERCEL_OIDC_TOKEN`. The env var is baked at deploy time and
 * goes stale after project-config changes such as adding a custom domain.
 * Workflow steps often have the header and not a fresh env token.
 */
export async function getVercelOidcToken(): Promise<string | null> {
  try {
    const token = (
      await readVercelOidcToken({ expirationBufferMs: 60_000 })
    ).trim();
    if (token) return token;
  } catch {
    // SDK throws when request context and env are both missing (local, tests).
  }

  // next/headers is request-scoped. A static import fails in Vitest and in
  // Workflow isolates that have no Next request store.
  try {
    const { headers } = await import("next/headers");
    const headerToken = (await headers()).get("x-vercel-oidc-token")?.trim();
    if (headerToken) return headerToken;
  } catch {
    // Not in a Next.js request.
  }

  return process.env.VERCEL_OIDC_TOKEN?.trim() || null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Returns a short-lived access token with `cloud-platform` scope.
 * Used by Vertex AI, GCS, and other GCP APIs on Vercel.
 */
export async function getWifAccessToken(config: WifConfig): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const oidcToken = await getVercelOidcToken();
  if (!oidcToken) {
    throw new Error(
      "Vercel OIDC token not available (checked VERCEL_OIDC_TOKEN env and x-vercel-oidc-token header)."
    );
  }

  const stsRes = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      audience: config.audience,
      grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
      subjectToken: oidcToken,
    }).toString(),
  });
  if (!stsRes.ok) {
    throw new Error(
      `STS exchange failed: ${stsRes.status} ${await stsRes.text()}`
    );
  }
  const federatedToken = (await stsRes.json()) as { access_token: string };

  const impRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${config.serviceAccountEmail}:generateAccessToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${federatedToken.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: ["https://www.googleapis.com/auth/cloud-platform"],
        lifetime: "3600s",
      }),
    }
  );
  if (!impRes.ok) {
    throw new Error(
      `Service account impersonation failed: ${impRes.status} ${await impRes.text()}`
    );
  }
  const impToken = (await impRes.json()) as {
    accessToken: string;
    expireTime: string;
  };

  cachedToken = {
    token: impToken.accessToken,
    expiresAt: new Date(impToken.expireTime).getTime(),
  };
  return cachedToken.token;
}

/** Options accepted by google-auth-library / gaxios-style `request`. */
export type WifAuthRequestOptions = {
  url?: string;
  uri?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  data?: unknown;
  body?: BodyInit | null;
  responseType?: string;
  params?: Record<string, string | number | boolean | undefined>;
  validateStatus?: (status: number) => boolean;
  signal?: AbortSignal;
};

export type WifAuthResponse<T> = {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: WifAuthRequestOptions;
  request: { responseURL: string };
};

function flattenHeaders(
  headers: Record<string, string | string[] | undefined> | undefined
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    out[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

/**
 * Auth client for SDKs that accept `googleAuthOptions.authClient`.
 * Must implement `request` — `@google-cloud/storage` resumable uploads call it
 * via `GoogleAuth.request` → `authClient.request` (not just getRequestHeaders).
 */
export function createWifAuthClient(config: WifConfig) {
  const client = {
    async getRequestHeaders() {
      return { Authorization: `Bearer ${await getWifAccessToken(config)}` };
    },
    async getAccessToken() {
      return { token: await getWifAccessToken(config) };
    },
    /** Used by GoogleAuth.getCredentials / Storage signed URLs. */
    async getCredentials() {
      return { client_email: config.serviceAccountEmail };
    },
    /**
     * IAM Credentials signBlob — required by `@google-cloud/storage`
     * `getSignedUrl` when there is no local private key (WIF on Vercel).
     * Returns a base64 signature string (same contract as `GoogleAuth.sign`).
     */
    async sign(data: string, endpoint?: string): Promise<string> {
      const base =
        endpoint ??
        "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/";
      const url = `${base}${config.serviceAccountEmail}:signBlob`;
      const token = await getWifAccessToken(config);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payload: Buffer.from(data).toString("base64"),
        }),
      });
      if (!res.ok) {
        throw new Error(`signBlob failed: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as { signedBlob?: string };
      if (!body.signedBlob) {
        throw new Error("signBlob response missing signedBlob");
      }
      return body.signedBlob;
    },
    async request<T>(opts: WifAuthRequestOptions): Promise<WifAuthResponse<T>> {
      const authHeaders = await client.getRequestHeaders();
      const rawUrl = opts.url ?? opts.uri;
      if (!rawUrl) {
        throw new Error("WIF auth client request requires url");
      }
      const url = new URL(rawUrl);
      if (opts.params) {
        for (const [key, value] of Object.entries(opts.params)) {
          if (value == null) continue;
          url.searchParams.set(key, String(value));
        }
      }

      const headers: Record<string, string> = {
        ...flattenHeaders(opts.headers),
        ...authHeaders,
      };

      let body: BodyInit | undefined;
      if (opts.body != null) {
        body = opts.body;
      } else if (opts.data != null) {
        if (
          typeof opts.data === "string" ||
          opts.data instanceof Uint8Array ||
          (typeof Buffer !== "undefined" && Buffer.isBuffer(opts.data))
        ) {
          body = opts.data as BodyInit;
        } else {
          if (!headers["Content-Type"] && !headers["content-type"]) {
            headers["Content-Type"] = "application/json";
          }
          body = JSON.stringify(opts.data);
        }
      }

      const res = await fetch(url, {
        method: (opts.method ?? "GET").toUpperCase(),
        headers,
        body,
        signal: opts.signal,
      });

      const responseHeaders = Object.fromEntries(res.headers.entries());
      let data: unknown;
      const responseType = opts.responseType ?? "json";
      if (responseType === "stream") {
        data = res.body;
      } else if (responseType === "text") {
        data = await res.text();
      } else if (responseType === "arraybuffer") {
        data = await res.arrayBuffer();
      } else {
        const text = await res.text();
        if (!text) {
          data = undefined;
        } else {
          try {
            data = JSON.parse(text) as unknown;
          } catch {
            data = text;
          }
        }
      }

      const response: WifAuthResponse<T> = {
        data: data as T,
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        config: opts,
        request: { responseURL: res.url },
      };

      const validateStatus =
        opts.validateStatus ?? ((status) => status >= 200 && status < 300);
      if (!validateStatus(res.status)) {
        const error = new Error(
          `WIF auth request failed with status ${res.status}`
        ) as Error & { response: WifAuthResponse<T>; config: WifAuthRequestOptions };
        error.response = response;
        error.config = opts;
        throw error;
      }
      return response;
    },
  };
  return client;
}

/** Reset cached token (for tests). */
export function resetWifTokenCache(): void {
  cachedToken = null;
}
