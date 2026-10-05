import { describe, expect, it } from "vitest";
import {
  isLiveWorkspaceComment,
  slimWorkspaceComments,
} from "./slim-workspace-comments";

describe("slimWorkspaceComments", () => {
  it("keeps open AI suggestion payloads", () => {
    const rows = [
      {
        kind: "ai_fix",
        status: "open",
        content: '{"tableOperation":{"kind":"insert_rows"}}',
      },
    ];
    expect(slimWorkspaceComments(rows)).toEqual(rows);
  });

  it("drops resolved and dismissed AI suggestion rows", () => {
    expect(
      slimWorkspaceComments([
        {
          kind: "ai_fix",
          status: "resolved",
          content: '{"tableOperation":{"kind":"insert_rows"}}',
        },
        {
          kind: "ai_redraft",
          status: "resolved",
          content: '{"markdown":"# long"}',
        },
        {
          kind: "ai_fix",
          status: "dismissed",
          content: '{"tableOperation":{"kind":"insert_rows"}}',
        },
        {
          kind: "ai_grammar",
          status: "resolved",
          content: '{"insertText":"rephrased"}',
        },
        {
          kind: "human",
          status: "resolved",
          content: "Please clarify.",
        },
        {
          kind: "human",
          status: "open",
          content: "Still open.",
        },
      ])
    ).toEqual([
      { kind: "human", status: "resolved", content: "Please clarify." },
      { kind: "human", status: "open", content: "Still open." },
    ]);
  });

  it("treats closed AI rows as not live", () => {
    expect(
      isLiveWorkspaceComment({ kind: "ai_fix", status: "resolved" })
    ).toBe(false);
    expect(
      isLiveWorkspaceComment({ kind: "ai_redraft", status: "dismissed" })
    ).toBe(false);
    expect(
      isLiveWorkspaceComment({ kind: "ai_tone", status: "resolved" })
    ).toBe(false);
    expect(isLiveWorkspaceComment({ kind: "ai_fix", status: "open" })).toBe(
      true
    );
  });
});
