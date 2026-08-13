import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CommentRecord } from "@/types/report";
import {
  acceptSuggestion,
  dismissSuggestion,
  SectionPersistError,
} from "@/lib/suggestions/accept-suggestion";

const reportId = "report-1";
const comment: CommentRecord = {
  id: "c1",
  reportId,
  parentId: null,
  sectionId: "s1",
  section: "define",
  authorId: "ai",
  content: JSON.stringify({
    deleteText: "DD/MM/YYYY",
    insertText: "[detection date: <to be filled>]",
    reasoning: "date missing",
  }),
  anchorText:
    "On dated DD/MM/YYYY at approximately HH:MM hrs, while performing routine operation.",
  contentPath: "narrative",
  fromPos: null,
  toPos: null,
  status: "open",
  kind: "ai_fix",
  source: "ai",
  externalAuthorName: null,
  externalAuthorInitials: null,
  externalCommentId: null,
  externalCreatedAt: null,
  locked: false,
  evaluationId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const sectionContent = {
  narrative: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "On dated DD/MM/YYYY at approximately HH:MM hrs, while performing routine operation.",
          },
        ],
      },
    ],
  },
};

describe("acceptSuggestion / dismissSuggestion (one writer)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accept claims the comment before saving the section", async () => {
    const fetches: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        fetches.push({ url: String(url), body });
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    const a = await acceptSuggestion({
      reportId,
      section: "define",
      comment,
      sectionContent: structuredClone(sectionContent),
    });
    const b = await acceptSuggestion({
      reportId,
      section: "define",
      comment,
      sectionContent: structuredClone(sectionContent),
    });

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.nextSection).toEqual(b.nextSection);
      const text = JSON.stringify(a.nextSection);
      expect(text).toContain("[detection date: <to be filled>]");
      expect(text).not.toContain("DD/MM/YYYY");
    }

    expect(fetches[0]?.url).toContain("/comments/c1");
    expect(fetches[0]?.body).toEqual({ status: "resolved" });
    expect(fetches[1]?.url).toContain("/sections/define");
  });

  it("accept leaves comment open when locate fails (no status flip)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await acceptSuggestion({
      reportId,
      section: "define",
      comment: {
        ...comment,
        anchorText: "text that is not in the document",
        content: JSON.stringify({
          deleteText: "missing",
          insertText: "x",
          reasoning: "x",
        }),
      },
      sectionContent: structuredClone(sectionContent),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accept returns save_failed with SectionPersistError on 403", async () => {
    const fetches: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        fetches.push(String(url));
        if (String(url).includes("/sections/")) {
          return {
            ok: false,
            status: 403,
            json: async () => ({ error: "Forbidden" }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    const result = await acceptSuggestion({
      reportId,
      section: "define",
      comment,
      sectionContent: structuredClone(sectionContent),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("save_failed");
      expect(result.error).toBeInstanceOf(SectionPersistError);
      expect((result.error as Error).message).toBe(
        "You can't save changes to this report."
      );
    }
    expect(fetches.some((u) => u.includes("/comments/c1"))).toBe(true);
    expect(fetches.filter((u) => u.includes("/comments/c1")).length).toBe(2);
  });

  it("accept returns status_failed on 409 without patching the section", async () => {
    const fetches: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        fetches.push({ url: String(url), body });
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error:
              "This suggestion is no longer open. It may have been revised, accepted, or dismissed.",
          }),
        } as Response;
      })
    );

    const result = await acceptSuggestion({
      reportId,
      section: "define",
      comment,
      sectionContent: structuredClone(sectionContent),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("status_failed");
    expect(fetches).toHaveLength(1);
    expect(fetches[0]?.url).toContain("/comments/c1");
    expect(fetches.some((f) => f.url.includes("/sections/"))).toBe(false);
  });

  it("dismiss flips status without requiring locate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response)
    );

    const result = await dismissSuggestion({
      reportId,
      section: "define",
      comment,
      sectionContent: structuredClone(sectionContent),
    });
    expect(result.ok).toBe(true);
  });
});
