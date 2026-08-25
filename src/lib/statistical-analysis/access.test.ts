import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import { isStatisticalAnalysisEnabled } from "@/lib/customers/packs";
import { canSaveReportSection } from "@/lib/reports/access";
import { requireAnalyticsAccess } from "./access";

vi.mock("@/db", () => ({ db: {} }));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/ai/chat/access", () => ({
  loadAccessibleReport: vi.fn(),
}));

vi.mock("@/lib/customers/packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customers/packs")>();
  return {
    ...actual,
    isStatisticalAnalysisEnabled: vi.fn(() => true),
  };
});

vi.mock("@/lib/reports/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/access")>();
  return {
    ...actual,
    canSaveReportSection: vi.fn(() => true),
  };
});

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const report = {
  id: "report-1",
  authorId: engineer.id,
  status: "draft",
  deletedAt: null,
  assignedManagerId: null,
  assignedManagerIds: [],
};

describe("requireAnalyticsAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isStatisticalAnalysisEnabled).mockReturnValue(true);
    vi.mocked(canSaveReportSection).mockReturnValue(true);
  });

  it("returns JSON 404 when the customer pack disables statistical analysis", async () => {
    vi.mocked(isStatisticalAnalysisEnabled).mockReturnValue(false);
    const result = await requireAnalyticsAccess("report-1", "view");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response).toBeInstanceOf(NextResponse);
    expect(result.response.status).toBe(404);
    expect(await result.response.json()).toEqual({ error: "Not found" });
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const result = await requireAnalyticsAccess("report-1", "view");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  it("returns 404 when the report is not visible", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValue(null);
    const result = await requireAnalyticsAccess("report-1", "view");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(404);
  });

  it("allows viewing without section-save permission", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValue({
      report,
      canEdit: false,
    } as never);
    vi.mocked(canSaveReportSection).mockReturnValue(false);

    const result = await requireAnalyticsAccess("report-1", "view");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canEdit).toBe(false);
  });

  it("forbids mutations when the section is locked", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(loadAccessibleReport).mockResolvedValue({
      report,
      canEdit: false,
    } as never);
    vi.mocked(canSaveReportSection).mockReturnValue(false);

    const result = await requireAnalyticsAccess("report-1", "mutate");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
  });
});
