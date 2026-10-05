import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/workspace-load-telemetry", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/workspace-load-telemetry")
  >();
  return {
    ...actual,
    isWorkspaceLoadTelemetryEnabled: vi.fn(() => true),
  };
});

import { getCurrentUser } from "@/lib/auth/session";
import { isWorkspaceLoadTelemetryEnabled } from "@/lib/workspace-load-telemetry";
import { POST } from "./route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

function request(body: unknown, bytes?: string) {
  return new Request("http://localhost/api/telemetry/workspace-load", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: bytes ?? JSON.stringify(body),
  });
}

describe("POST /api/telemetry/workspace-load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWorkspaceLoadTelemetryEnabled).mockReturnValue(true);
  });

  it("returns 204 when telemetry is off", async () => {
    vi.mocked(isWorkspaceLoadTelemetryEnabled).mockReturnValue(false);
    const res = await POST(
      request({
        reportId: "r1",
        loadId: "load-1",
        stage: "loader_mounted",
        t: 1,
      })
    );
    expect(res.status).toBe(204);
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const res = await POST(
      request({
        reportId: "r1",
        loadId: "load-1",
        stage: "loader_mounted",
        t: 1,
      })
    );
    expect(res.status).toBe(401);
  });

  it("rejects invalid payloads", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    const res = await POST(request({ stage: "nope" }));
    expect(res.status).toBe(400);
  });

  it("rejects oversized payloads", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    const res = await POST(request({}, "x".repeat(4097)));
    expect(res.status).toBe(413);
  });

  it("accepts a valid stage beacon", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await POST(
      request({
        reportId: "r1",
        loadId: "load-1",
        documentType: "equipment_lifecycle_report",
        stage: "bundle_parsed",
        t: 900,
        extra: { bytes: 1200 },
      })
    );
    expect(res.status).toBe(200);
    expect(info).toHaveBeenCalledWith(
      "[wl]",
      expect.objectContaining({
        reportId: "r1",
        loadId: "load-1",
        stage: "bundle_parsed",
      })
    );
    info.mockRestore();
  });
});
