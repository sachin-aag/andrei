import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/me/walkthrough/route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      workspaceUsers: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { db } from "@/db";

describe("/api/me/walkthrough", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("GET returns stored progress", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { workspaceUserId: "u1" },
    } as never);
    vi.mocked(db.query.workspaceUsers.findFirst).mockResolvedValue({
      productTourStatus: "in_progress",
      productTourStepId: "create-report",
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "in_progress",
      stepId: "create-report",
    });
  });

  it("PATCH rejects invalid bodies", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { workspaceUserId: "u1" },
    } as never);
    const res = await PATCH(
      new Request("http://localhost/api/me/walkthrough", {
        method: "PATCH",
        body: JSON.stringify({ status: "nope" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("PATCH persists dismissed progress", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { workspaceUserId: "u1" },
    } as never);
    const returning = vi.fn().mockResolvedValue([
      { productTourStatus: "dismissed", productTourStepId: "welcome" },
    ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as never);

    const res = await PATCH(
      new Request("http://localhost/api/me/walkthrough", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed", stepId: "welcome" }),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "dismissed",
      stepId: "welcome",
    });
    expect(set).toHaveBeenCalledWith({
      productTourStatus: "dismissed",
      productTourStepId: "welcome",
    });
  });
});
