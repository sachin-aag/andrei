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

/** Read the Vercel OIDC token from env or request header. */
export async function getVercelOidcToken(): Promise<string | null> {
  const fromEnv = process.env.VERCEL_OIDC_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return h.get("x-vercel-oidc-token");
  } catch {
    return null;
  }
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
    throw new Error(`STS exchange failed: ${stsRes.status} ${await stsRes.text()}`);
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

/** Minimal Google Auth client for SDKs that accept googleAuthOptions.authClient. */
export function createWifAuthClient(config: WifConfig) {
  return {
    async getRequestHeaders() {
      return { Authorization: `Bearer ${await getWifAccessToken(config)}` };
    },
    async getAccessToken() {
      return { token: await getWifAccessToken(config) };
    },
  };
}

/** Reset cached token (for tests). */
export function resetWifTokenCache(): void {
  cachedToken = null;
}
