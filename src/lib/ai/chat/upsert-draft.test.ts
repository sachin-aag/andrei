import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: { transaction: vi.fn() } }));

import { parseAiRedraftCommentContent } from "@/lib/ai/suggestion-gating";
import {
  planChatFieldDraftUpsert,
  upsertChatFieldDraft,
  type ChatFieldDraftStore,
  type OpenChatFieldSuggestion,
} from "@/lib/ai/chat/upsert-draft";

const DRAFT = {
  markdown: "Batch B-441 failed SST at 117.0%.",
  reasoning: "Fill the re-test result.",
  fieldHashAtSuggestion: "hash-1",
};

function at(iso: string): Date {
  return new Date(iso);
}

function createMemoryStore(opts?: {
  initial?: OpenChatFieldSuggestion[];
  extraOnSecondList?: OpenChatFieldSuggestion[];
}) {
  const rows: OpenChatFieldSuggestion[] = [...(opts?.initial ?? [])];
  const contents = new Map<string, string>();
  const dismissed: string[] = [];
  let listCalls = 0;

  const store: ChatFieldDraftStore = {
    async listOpen() {
      listCalls += 1;
      const extra =
        listCalls >= 2 && opts?.extraOnSecondList
          ? opts.extraOnSecondList
          : [];
      return [...rows, ...extra];
    },
    async insertRedraft({ id, content }) {
      rows.push({ id, kind: "ai_redraft", createdAt: new Date() });
      contents.set(id, content);
    },
    async updateRedraft({ id, content }) {
      contents.set(id, content);
    },
    async dismiss(ids) {
      dismissed.push(...ids);
      for (const id of ids) {
        const index = rows.findIndex((row) => row.id === id);
        if (index >= 0) rows.splice(index, 1);
      }
    },
  };

  return { store, rows, contents, dismissed };
}

describe("planChatFieldDraftUpsert", () => {
  it("inserts when the field has no open chat redraft", () => {
    expect(planChatFieldDraftUpsert([], () => "new-draft")).toEqual({
      mode: "insert",
      suggestionId: "new-draft",
      replaced: false,
      dismissIds: [],
    });
  });

  it("updates the oldest open redraft and dismisses extras plus chat ai_fixs", () => {
    const plan = planChatFieldDraftUpsert(
      [
        {
          id: "fix-1",
          kind: "ai_fix",
          createdAt: at("2026-08-17T10:04:59.000Z"),
        },
        {
          id: "draft-new",
          kind: "ai_redraft",
          createdAt: at("2026-08-17T10:05:05.000Z"),
        },
        {
          id: "draft-old",
          kind: "ai_redraft",
          createdAt: at("2026-08-17T10:04:58.000Z"),
        },
      ],
      () => "unused"
    );

    expect(plan).toEqual({
      mode: "update",
      suggestionId: "draft-old",
      replaced: true,
      dismissIds: ["draft-new", "fix-1"],
    });
  });

  it("dismisses a chat ai_fix when inserting the first redraft", () => {
    const plan = planChatFieldDraftUpsert(
      [
        {
          id: "fix-1",
          kind: "ai_fix",
          createdAt: at("2026-08-17T10:04:59.000Z"),
        },
      ],
      () => "new-draft"
    );

    expect(plan).toEqual({
      mode: "insert",
      suggestionId: "new-draft",
      replaced: false,
      dismissIds: ["fix-1"],
    });
  });
});

describe("upsertChatFieldDraft", () => {
  it("inserts the first draft and returns replaced false", async () => {
    const memory = createMemoryStore();
    const result = await upsertChatFieldDraft(memory.store, DRAFT, () => "draft-1");

    expect(result).toEqual({ suggestionId: "draft-1", replaced: false });
    expect(memory.rows.map((row) => row.id)).toEqual(["draft-1"]);
    expect(parseAiRedraftCommentContent(memory.contents.get("draft-1")!)).toMatchObject(
      DRAFT
    );
  });

  it("replaces the open redraft in place and dismisses a sibling chat ai_fix", async () => {
    const memory = createMemoryStore({
      initial: [
        {
          id: "draft-1",
          kind: "ai_redraft",
          createdAt: at("2026-08-17T10:04:58.000Z"),
        },
        {
          id: "fix-1",
          kind: "ai_fix",
          createdAt: at("2026-08-17T10:05:01.000Z"),
        },
      ],
    });
    memory.contents.set("draft-1", "old");

    const result = await upsertChatFieldDraft(
      memory.store,
      { ...DRAFT, markdown: "Re-test result is 117.0%." },
      () => "unused"
    );

    expect(result).toEqual({ suggestionId: "draft-1", replaced: true });
    expect(memory.dismissed).toEqual(["fix-1"]);
    expect(memory.rows.map((row) => row.id)).toEqual(["draft-1"]);
    expect(parseAiRedraftCommentContent(memory.contents.get("draft-1")!).markdown).toBe(
      "Re-test result is 117.0%."
    );
  });

  it("dismisses a concurrent extra redraft after write, keeping the row just written", async () => {
    const extra: OpenChatFieldSuggestion = {
      id: "race-draft",
      kind: "ai_redraft",
      createdAt: at("2026-08-17T10:05:06.000Z"),
    };
    const memory = createMemoryStore({ extraOnSecondList: [extra] });

    const result = await upsertChatFieldDraft(memory.store, DRAFT, () => "draft-1");

    expect(result.suggestionId).toBe("draft-1");
    expect(memory.dismissed).toContain("race-draft");
    expect(memory.rows.map((row) => row.id)).toEqual(["draft-1"]);
  });
});
