import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/reports/require-report-access", () => ({
  requireReportAccess: vi.fn(),
}));

vi.mock("@/lib/attachments/folders", () => ({
  listAttachmentFolders: vi.fn(),
}));

vi.mock("@/lib/attachments/list-active", () => ({
  listActiveAttachments: vi.fn(),
}));

vi.mock("@/lib/attachments/start-vault-ingest", () => ({
  startIngestForUnprocessedLinkedVaultAssets: vi.fn(),
}));

vi.mock("@/lib/attachments/stale-ingest", () => ({
  reclaimStaleIngests: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: () => unknown) => {
      void task();
    },
  };
});

import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { listAttachmentFolders } from "@/lib/attachments/folders";
import { listActiveAttachments } from "@/lib/attachments/list-active";
import { startIngestForUnprocessedLinkedVaultAssets } from "@/lib/attachments/start-vault-ingest";
import { reclaimStaleIngests } from "@/lib/attachments/stale-ingest";
import { GET } from "./route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

describe("GET /api/reports/[reportId]/attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(requireReportAccess).mockResolvedValue({
      ok: true,
      user: engineer,
      report: { id: "r1" },
      canView: true,
      canEdit: true,
      canMutateAttachments: true,
    } as never);
    vi.mocked(listActiveAttachments).mockResolvedValue([{ id: "a1" }] as never);
    vi.mocked(listAttachmentFolders).mockResolvedValue([] as never);
  });

  it("lists without reclaim or ingest on the initial read", async () => {
    const res = await GET(new Request("http://localhost/api/reports/r1/attachments"), {
      params: Promise.resolve({ reportId: "r1" }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      attachments: [{ id: "a1" }],
      folders: [],
    });
    expect(reclaimStaleIngests).not.toHaveBeenCalled();
    expect(startIngestForUnprocessedLinkedVaultAssets).not.toHaveBeenCalled();
  });

  it("reclaims and kicks ingest on the polling sync path", async () => {
    const res = await GET(
      new Request("http://localhost/api/reports/r1/attachments?sync=1"),
      { params: Promise.resolve({ reportId: "r1" }) }
    );
    expect(res.status).toBe(200);
    expect(reclaimStaleIngests).toHaveBeenCalledWith("r1");
    expect(startIngestForUnprocessedLinkedVaultAssets).toHaveBeenCalledWith([
      { id: "a1" },
    ]);
  });
});
