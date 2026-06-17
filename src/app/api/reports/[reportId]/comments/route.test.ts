import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(),
}));

import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { GET, POST } from "@/app/api/reports/[reportId]/comments/route";

const engineer = {
  id: "engineer-1",
  name: "Engineer",
  email: "engineer@example.com",
  role: "engineer" as const,
  title: "Quality Engineer",
};

const manager = {
  id: "manager-1",
  name: "Manager",
  email: "manager@example.com",
  role: "manager" as const,
  title: "QA Manager",
};

const report = {
  id: "report-1",
  authorId: engineer.id,
  assignedManagerId: manager.id,
  status: "submitted",
};

function mockSelectOnce(rows: unknown[]) {
  const where = vi.fn().mockResolvedValueOnce(rows);
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockSelectOrdered(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValueOnce(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockInsertReturning(row: unknown) {
  const returning = vi.fn().mockResolvedValueOnce([row]);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValueOnce({ values } as never);
}

describe("/api/reports/[reportId]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/comments"), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(401);
  });

  it("GET returns comments for authenticated users", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    mockSelectOrdered([{ id: "comment-1", content: "Note" }]);

    const response = await GET(new Request("http://localhost/comments"), {
      params: Promise.resolve({ reportId: report.id }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      comments: [{ id: "comment-1", content: "Note" }],
    });
  });

  it("POST returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/comments", {
        method: "POST",
        body: JSON.stringify({ content: "Hello", section: "define" }),
      }),
      { params: Promise.resolve({ reportId: report.id }) }
    );

    expect(response.status).toBe(401);
  });

  it("POST returns 403 when a non-manager starts a new thread on someone else's report", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      ...engineer,
      id: "other-engineer",
    });
    mockSelectOnce([report]);

    const response = await POST(
      new Request("http://localhost/comments", {
        method: "POST",
        body: JSON.stringify({ content: "Hello", section: "define" }),
      }),
      { params: Promise.resolve({ reportId: report.id }) }
    );

    expect(response.status).toBe(403);
  });

  it("POST inserts a manager comment", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(manager);
    mockSelectOnce([report]);
    mockInsertReturning({
      id: "comment-1",
      content: "Please clarify scope.",
      section: "define",
    });
    const returning = vi.fn().mockResolvedValueOnce([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValueOnce({ set } as never);

    const response = await POST(
      new Request("http://localhost/comments", {
        method: "POST",
        body: JSON.stringify({
          content: "Please clarify scope.",
          section: "define",
        }),
      }),
      { params: Promise.resolve({ reportId: report.id }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      comment: {
        id: "comment-1",
        content: "Please clarify scope.",
        section: "define",
      },
    });
  });

  it("POST rejects content over 1024 characters", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(manager);
    mockSelectOnce([report]);

    const response = await POST(
      new Request("http://localhost/comments", {
        method: "POST",
        body: JSON.stringify({
          content: "x".repeat(1025),
          section: "define",
        }),
      }),
      { params: Promise.resolve({ reportId: report.id }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Content exceeds 1024 character limit",
    });
  });

  it("POST rejects invalid parent comment", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(engineer);
    mockSelectOnce([report]);
    mockSelectOnce([]);

    const response = await POST(
      new Request("http://localhost/comments", {
        method: "POST",
        body: JSON.stringify({
          content: "Reply",
          parentId: "missing-parent",
        }),
      }),
      { params: Promise.resolve({ reportId: report.id }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Parent comment not found",
    });
  });
});
