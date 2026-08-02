import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWifAuthClient,
  resetWifTokenCache,
  type WifConfig,
} from "@/lib/gcp/wif-token";

const config: WifConfig = {
  audience: "//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/p/providers/v",
  serviceAccountEmail: "runtime@example.iam.gserviceaccount.com",
};

describe("createWifAuthClient", () => {
  afterEach(() => {
    resetWifTokenCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("implements request used by @google-cloud/storage resumable uploads", async () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-token");

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
});
