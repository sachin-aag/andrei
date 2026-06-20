import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth/password-policy", () => ({
  getPasswordPolicy: vi.fn(),
  updatePasswordExpiryDays: vi.fn(),
}));

import { getPasswordPolicy, updatePasswordExpiryDays } from "@/lib/auth/password-policy";
import { getCurrentUser } from "@/lib/auth/session";
import { GET, PATCH } from "./route";

const admin = {
  id: "admin-1",
  name: "Admin",
  email: "admin@mjbiopharm.com",
  role: "admin" as const,
  title: "Admin",
};

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@mjbiopharm.com",
  role: "engineer" as const,
  title: "Engineer",
};

const policy = {
  minLength: 6,
  requireLetter: true,
  requireNumber: true,
  requireSpecial: true,
  expiryDays: 90,
  warningDays: 14,
  failedLoginAttemptLimit: 3,
  passwordHistoryLimit: 3,
};

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/admin/password-policy", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/password-policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPasswordPolicy).mockResolvedValue(policy);
    vi.mocked(updatePasswordExpiryDays).mockResolvedValue(120);
  });

  it("rejects unauthenticated GET requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("rejects non-admin GET requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("returns expiry days for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ expiryDays: 90 });
  });

  it("rejects invalid PATCH payloads", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await PATCH(patchRequest({ expiryDays: -1 }));

    expect(response.status).toBe(400);
    expect(updatePasswordExpiryDays).not.toHaveBeenCalled();
  });

  it("updates expiry days for admins", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(admin);

    const response = await PATCH(patchRequest({ expiryDays: 120 }));

    expect(response.status).toBe(200);
    expect(updatePasswordExpiryDays).toHaveBeenCalledWith(120);
    await expect(response.json()).resolves.toEqual({ expiryDays: 120 });
  });
});
