import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    query: {
      workspaceUsers: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/auth/password-reset", () => ({
  sendPasswordResetLink: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  auditActorFromId: vi.fn((id: string, name?: string) => ({
    id,
    name: name ?? id,
    role: "unknown",
  })),
  recordAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

import { db } from "@/db";
import { sendPasswordResetLink } from "@/lib/auth/password-reset";
import { recordAuditEvent } from "@/lib/audit";
import { POST } from "./route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth-pw/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth-pw/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendPasswordResetLink).mockResolvedValue(undefined);
  });

  it("returns ok without sending when the email is missing", async () => {
    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(sendPasswordResetLink).not.toHaveBeenCalled();
  });

  it("returns ok without sending when the account does not exist", async () => {
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce(undefined);

    const response = await POST(jsonRequest({ email: "nobody@mjbiopharm.com" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(sendPasswordResetLink).not.toHaveBeenCalled();
  });

  it("sends a reset link when the account is locked after failed sign-in", async () => {
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      id: "user-1",
      name: "Locked User",
      lockedAt: new Date("2026-10-02T00:00:00.000Z"),
      deactivatedAt: null,
    } as never);

    const response = await POST(
      jsonRequest({ email: " Locked@MJBiopharm.com " })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(sendPasswordResetLink).toHaveBeenCalledWith("locked@mjbiopharm.com");
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "user-1",
        action: "auth_password_reset",
        metadata: { stage: "requested" },
      })
    );
  });

  it("sends a reset link for an unlocked account", async () => {
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      id: "user-2",
      name: "Open User",
      lockedAt: null,
      deactivatedAt: null,
    } as never);

    const response = await POST(jsonRequest({ email: "user@mjbiopharm.com" }));

    expect(response.status).toBe(200);
    expect(sendPasswordResetLink).toHaveBeenCalledWith("user@mjbiopharm.com");
  });

  it("does not email a deactivated account", async () => {
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      id: "user-3",
      name: "Retired",
      lockedAt: null,
      deactivatedAt: new Date("2026-06-24T00:00:00.000Z"),
    } as never);

    const response = await POST(jsonRequest({ email: "retired@mjbiopharm.com" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(sendPasswordResetLink).not.toHaveBeenCalled();
  });

  it("returns 503 when sending fails for a known account", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValueOnce({
      id: "user-1",
      name: "Locked User",
      lockedAt: new Date("2026-10-02T00:00:00.000Z"),
      deactivatedAt: null,
    } as never);
    vi.mocked(sendPasswordResetLink).mockRejectedValueOnce(
      new Error("Resend API error")
    );

    const response = await POST(jsonRequest({ email: "locked@mjbiopharm.com" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Could not send a reset link. Please try again or contact your admin.",
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "user-1",
        action: "auth_password_reset",
        metadata: { stage: "send_failed" },
      })
    );
  });
});
