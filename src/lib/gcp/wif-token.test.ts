import { afterEach, describe, expect, it, vi } from "vitest";

const readVercelOidcToken = vi.hoisted(() => vi.fn());

vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: readVercelOidcToken,
}));

import {
  createWifAuthClient,
  getVercelOidcToken,
  resetWifTokenCache,
  type WifConfig,
} from "@/lib/gcp/wif-token";

const config: WifConfig = {
  audience: "//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/v",
  serviceAccountEmail: "runtime@example.iam.gserviceaccount.com",
};

describe("getVercelOidcToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    readVercelOidcToken.mockReset();
  });

  it("prefers the request-context token from @vercel/oidc over bake-time env", async () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "stale-bake-time");
    readVercelOidcToken.mockResolvedValueOnce("fresh-request-token");
    await expect(getVercelOidcToken()).resolves.toBe("fresh-request-token");
    expect(readVercelOidcToken).toHaveBeenCalledWith({
      expirationBufferMs: 60_000,
    });
  });

  it("falls back to VERCEL_OIDC_TOKEN when the SDK has no context", async () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "env-token");
    readVercelOidcToken.mockRejectedValueOnce(new Error("no oidc context"));
    await expect(getVercelOidcToken()).resolves.toBe("env-token");
  });

  it("ignores an empty SDK token and uses env", async () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "env-token");
    readVercelOidcToken.mockResolvedValueOnce("  ");
    await expect(getVercelOidcToken()).resolves.toBe("env-token");
  });
});

describe("createWifAuthClient", () => {
  afterEach(() => {
    resetWifTokenCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    readVercelOidcToken.mockReset();
  });

  it("implements request used by @google-cloud/storage resumable uploads", async () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-token");
    readVercelOidcToken.mockRejectedValue(new Error("no oidc context"));

    const fetchMock = vi
      .fn()
      // STS
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "federated" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      // impersonation
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "ya29.access",
            expireTime: new Date(Date.now() + 3_600_000).toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      // GCS createURI
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: {
            location:
              "https://storage.googleapis.com/upload/storage/v1/b/bucket/o?uploadType=resumable&upload_id=abc",
          },
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const client = createWifAuthClient(config);
    expect(typeof client.request).toBe("function");

    const res = await client.request({
      method: "POST",
      url: "https://storage.googleapis.com/upload/storage/v1/b/bucket/o",
      params: { name: "staging/x/source.pdf", uploadType: "resumable" },
      data: { contentType: "application/pdf" },
      headers: { Origin: "https://andrei-demo.vercel.app" },
    });

    expect(res.headers.location).toContain("uploadType=resumable");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const gcsCall = fetchMock.mock.calls[2]![0] as URL;
    expect(gcsCall.href).toContain("uploadType=resumable");
    expect(gcsCall.href).toContain("name=staging");

    const gcsInit = fetchMock.mock.calls[2]![1] as RequestInit;
    expect(gcsInit.headers).toMatchObject({
      Authorization: "Bearer ya29.access",
      Origin: "https://andrei-demo.vercel.app",
      "Content-Type": "application/json",
    });
  });

  it("implements sign via IAM signBlob for GCS signed URLs", async () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-token");
    readVercelOidcToken.mockRejectedValue(new Error("no oidc context"));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "federated" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "ya29.access",
            expireTime: new Date(Date.now() + 3_600_000).toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ signedBlob: "c2lnbmF0dXJl" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const client = createWifAuthClient(config);
    const signature = await client.sign("canonical-request-to-sign");
    expect(signature).toBe("c2lnbmF0dXJl");

    const signCall = fetchMock.mock.calls[2]!;
    expect(String(signCall[0])).toContain(
      "runtime@example.iam.gserviceaccount.com:signBlob"
    );
    const signInit = signCall[1] as RequestInit;
    expect(signInit.headers).toMatchObject({
      Authorization: "Bearer ya29.access",
    });
    expect(JSON.parse(String(signInit.body))).toEqual({
      payload: Buffer.from("canonical-request-to-sign").toString("base64"),
    });
  });
});
