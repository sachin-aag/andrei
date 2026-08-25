import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  auditActorFromUser: vi.fn((user: { id: string; name: string; role: string }) => ({
    id: user.id,
    name: user.name,
    role: user.role,
  })),
  recordAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

vi.mock("@/lib/customers/packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customers/packs")>();
  return {
    ...actual,
    getCustomerPack: vi.fn(() => actual.CONVERGENT_PACK),
  };
});

vi.mock("@/lib/reports/managers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/managers")>();
  return {
    ...actual,
    listReportManagerIds: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("@/lib/reports/ensure-hidden-expert-reviewer", () => ({
  assignHiddenExpertReviewerToReport: vi.fn().mockResolvedValue({
    id: "expert-1",
    email: "aditya+manager@andreihealth.com",
  }),
}));

vi.mock("@/lib/reports/send-expert-review-email", () => ({
  sendExpertReviewEmail: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit";
import { CONVERGENT_PACK, DEMO_PACK, getCustomerPack } from "@/lib/customers/packs";
import { assignHiddenExpertReviewerToReport } from "@/lib/reports/ensure-hidden-expert-reviewer";
import { sendExpertReviewEmail } from "@/lib/reports/send-expert-review-email";
import { POST } from "./route";

const engineer = {
  id: "engineer-1",
  name: "Sam Engineer",
  email: "sam@convergentdental.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const otherEngineer = {
  id: "engineer-2",
  name: "Other",
  email: "other@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const draftReport = {
  id: "report-1",
  authorId: engineer.id,
  assignedManagerId: "manager-1",
  status: "draft",
  documentNo: "DV-100",
  deletedAt: null,
};

function mockSelectOnce(rows: unknown[]) {
  const where = vi.fn().mockResolvedValueOnce(rows);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function post(body: unknown = {}) {
  return POST(
    new Request("http://localhost/api/reports/report-1/expert-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ reportId: "report-1" }) }
  );
}

describe("/api/reports/[reportId]/expert-review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCustomerPack).mockReturnValue(CONVERGENT_PACK);
    vi.mocked(getCurrentUser).mockResolvedValue(engineer);
    vi.mocked(sendExpertReviewEmail).mockResolvedValue(undefined);
    vi.mocked(assignHiddenExpertReviewerToReport).mockResolvedValue({
      id: "expert-1",
      email: "aditya+manager@andreihealth.com",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await post();

    expect(response.status).toBe(401);
  });

  it("returns 404 when the customer pack disables expert review", async () => {
    vi.mocked(getCustomerPack).mockReturnValue(DEMO_PACK);

    const response = await post();

    expect(response.status).toBe(404);
    expect(sendExpertReviewEmail).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-author engineer requests review", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(otherEngineer);
    mockSelectOnce([draftReport]);

    const response = await post({ note: "Please look at results." });

    expect(response.status).toBe(403);
    expect(sendExpertReviewEmail).not.toHaveBeenCalled();
  });

  it("returns 409 when the report is already approved", async () => {
    mockSelectOnce([{ ...draftReport, status: "approved" }]);

    const response = await post();

    expect(response.status).toBe(409);
    expect(sendExpertReviewEmail).not.toHaveBeenCalled();
  });

  it("assigns Aditya, emails both parties, and records an audit event", async () => {
    mockSelectOnce([draftReport]);

    const response = await post({ note: "Please look at the results table." });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(assignHiddenExpertReviewerToReport).toHaveBeenCalledWith("report-1");
    expect(sendExpertReviewEmail).toHaveBeenCalledWith({
      reportId: "report-1",
      documentNo: "DV-100",
      requesterName: engineer.name,
      requesterEmail: engineer.email,
      note: "Please look at the results table.",
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "report_updated",
        entityId: "report-1",
        reportId: "report-1",
      })
    );
  });
});
