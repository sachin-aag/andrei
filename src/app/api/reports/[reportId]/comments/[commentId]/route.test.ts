import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { PATCH } from "@/app/api/reports/[reportId]/comments/[commentId]/route";

function mockSelectOnce(rows: unknown[]) {
  const where = vi.fn().mockResolvedValueOnce(rows);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

describe("/api/reports/[reportId]/comments/[commentId]", () => {
  it("rejects content edits for locked imported Word comments", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: "627",
      name: "Manager",
      email: "manager@example.com",
      role: "manager",
      title: "QA Manager",
    });
    mockSelectOnce([
      {
        id: "comment-1",
        reportId: "report-1",
        parentId: null,
        authorId: "word",
        locked: true,
        kind: "word_import",
      },
    ]);
    mockSelectOnce([
      {
        id: "report-1",
        authorId: "598",
      },
    ]);

    const response = await PATCH(
      new Request("http://localhost/api/reports/report-1/comments/comment-1", {
        method: "PATCH",
        body: JSON.stringify({ content: "changed" }),
      }),
      { params: Promise.resolve({ reportId: "report-1", commentId: "comment-1" }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Imported Word comments cannot be edited",
    });
    expect(db.update).not.toHaveBeenCalled();
  });
});
