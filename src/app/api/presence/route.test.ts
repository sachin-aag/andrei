import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/usage/activity", async () => {
  const actual = await vi.importActual<typeof import("@/lib/usage/activity")>(
    "@/lib/usage/activity"
  );
  return {
    ...actual,
    recordPresenceSeconds: vi.fn(),
  };
});

import { getCurrentUser } from "@/lib/auth/session";
import { recordPresenceSeconds } from "@/lib/usage/activity";
import { POST } from "./route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@mjbiopharm.com",
  role: "engineer" as const,
  title: "Engineer",
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/presence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records clamped seconds for the signed-in user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(engineer as never);
    vi.mocked(recordPresenceSeconds).mockResolvedValue();
    const response = await POST(jsonRequest({ seconds: 30 }));
    expect(response.status).toBe(200);
    expect(recordPresenceSeconds).toHaveBeenCalledWith("engineer-1", 30);
  });

  it("rejects anonymous requests", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await POST(jsonRequest({ seconds: 30 }));
    expect(response.status).toBe(401);
    expect(recordPresenceSeconds).not.toHaveBeenCalled();
  });
});
