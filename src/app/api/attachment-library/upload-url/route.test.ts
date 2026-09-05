import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/attachments/library-folders", () => ({
  ensureLibraryFolderPath: vi.fn(),
  loadLibraryFolder: vi.fn(),
}));

vi.mock("@/lib/attachments/reserve-upload", () => ({
  reserveLibraryUpload: vi.fn(),
}));

vi.mock("@/lib/attachments/sync-asset-processing", () => ({
  syncAssetProcessing: vi.fn(),
}));

vi.mock("@/lib/storage/attachments", () => ({
  getAttachmentStorage: vi.fn(),
}));

import { ensureLibraryFolderPath } from "@/lib/attachments/library-folders";
import { reserveLibraryUpload } from "@/lib/attachments/reserve-upload";
import { getCurrentUser } from "@/lib/auth/session";
import { getAttachmentStorage } from "@/lib/storage/attachments";
import { POST } from "./route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@mjbiopharm.com",
  role: "engineer" as const,
  title: "Engineer",
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/attachment-library/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

describe("/api/attachment-library/upload-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureLibraryFolderPath).mockResolvedValue({
      ok: true,
      folderId: null,
    });
    vi.mocked(getAttachmentStorage).mockReturnValue({
      createResumableUpload: vi.fn().mockResolvedValue("https://upload.example/session"),
    } as never);
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await POST(
      postRequest({
        filename: "coa.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1200,
      })
    );

    expect(response.status).toBe(401);
  });

  it("rejects unsupported file types", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);

    const response = await POST(
      postRequest({
        filename: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 12,
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Only PDF and Word (.docx) files are allowed",
    });
  });

  it("returns 429 when the workspace storage cap is reached", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(reserveLibraryUpload).mockResolvedValueOnce({
      ok: false,
      error:
        "This workspace has reached its attachment storage limit. Contact your administrator.",
      status: 429,
    });

    const response = await POST(
      postRequest({
        filename: "coa.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1200,
      })
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: "attachment_storage_budget_exceeded",
    });
  });

  it("reserves a library upload and returns a resumable URL", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    vi.mocked(reserveLibraryUpload).mockResolvedValueOnce({
      ok: true,
      assetId: "asset-1",
      stagingObjectKey: "staging/asset-1",
      permanentObjectKey: "perm/asset-1",
    });

    const response = await POST(
      postRequest({
        filename: "coa.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1200,
        relativePath: "Quality/coa.pdf",
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      assetId: "asset-1",
      uploadUrl: "https://upload.example/session",
    });
    expect(ensureLibraryFolderPath).toHaveBeenCalledWith({
      ownerId: "engineer-1",
      parentId: null,
      segments: ["Quality"],
    });
  });
});
