import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: unknown) => {
      if (typeof task === "function") void (task as () => unknown)();
    },
  };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/reports/require-report-access", () => ({
  requireReportAccess: vi.fn(),
}));

vi.mock("@/lib/ai/proofread/proofread", () => ({
  proofreadUnits: vi.fn(),
}));

vi.mock("@/lib/ai/proofread/budget", () => ({
  resolveProofreadBudgetSkip: vi.fn(async () => null),
}));

vi.mock("@/lib/ai/proofread/rate-limit", () => ({
  takeProofreadRateSlot: vi.fn(() => true),
}));

vi.mock("@/lib/observability/langfuse", () => ({
  observeRouteHandler: (_name: string, handler: unknown) => handler,
  setRouteObservationIO: vi.fn(),
  flushLangfuseTraces: vi.fn(async () => undefined),
}));

import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { proofreadUnits } from "@/lib/ai/proofread/proofread";
import { resolveProofreadBudgetSkip } from "@/lib/ai/proofread/budget";
import { takeProofreadRateSlot } from "@/lib/ai/proofread/rate-limit";
import { POST } from "./route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const report = {
  id: "report-1",
  authorId: "engineer-1",
  status: "draft" as const,
  documentType: "investigation_report" as const,
  deletedAt: null,
};

const params = { params: Promise.resolve({ reportId: "report-1" }) };

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/reports/report-1/proofread", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/reports/[reportId]/proofread", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(requireReportAccess).mockResolvedValue({
      ok: true,
      user: engineer,
      report,
      canView: true,
      canEdit: true,
      canMutateAttachments: true,
    } as never);
    vi.mocked(takeProofreadRateSlot).mockReturnValue(true);
    vi.mocked(resolveProofreadBudgetSkip).mockResolvedValue(null);
    vi.mocked(proofreadUnits).mockReset();
    vi.mocked(proofreadUnits).mockResolvedValue([
      {
        id: "h:dont:don't",
        unitId: "p-0",
        unitHash: "h",
        severity: "grammar",
        deleteText: "dont",
        insertText: "don't",
        anchorText: "i dont know",
        label: "don't",
      },
    ]);
  });

  it("returns issues for a writable report", async () => {
    const res = await POST(
      jsonRequest({
        section: "define",
        contentPath: "narrative",
        units: [{ id: "p-0", text: "i dont know what happened here" }],
      }),
      params
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { issues: unknown[] };
    expect(body.issues).toHaveLength(1);
  });

  it("fail-opens on a locked report", async () => {
    vi.mocked(requireReportAccess).mockResolvedValue({
      ok: true,
      user: engineer,
      report: { ...report, status: "approved" },
      canView: true,
      canEdit: false,
      canMutateAttachments: false,
    } as never);
    const res = await POST(
      jsonRequest({
        section: "define",
        contentPath: "narrative",
        units: [{ id: "p-0", text: "i dont know what happened here" }],
      }),
      params
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { issues: unknown[]; skipped?: string };
    expect(body.issues).toEqual([]);
    expect(body.skipped).toBe("read_only");
  });

  it("fail-opens when the proofread budget is exhausted", async () => {
    vi.mocked(resolveProofreadBudgetSkip).mockResolvedValue("budget");
    const res = await POST(
      jsonRequest({
        section: "define",
        contentPath: "narrative",
        units: [{ id: "p-0", text: "i dont know what happened here" }],
      }),
      params
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skipped?: string };
    expect(body.skipped).toBe("budget");
    expect(proofreadUnits).not.toHaveBeenCalled();
  });

  it("fail-opens when the per-user rate limit trips", async () => {
    vi.mocked(takeProofreadRateSlot).mockReturnValue(false);
    const res = await POST(
      jsonRequest({
        section: "define",
        contentPath: "narrative",
        units: [{ id: "p-0", text: "i dont know what happened here" }],
      }),
      params
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skipped?: string };
    expect(body.skipped).toBe("rate_limit");
  });
});
