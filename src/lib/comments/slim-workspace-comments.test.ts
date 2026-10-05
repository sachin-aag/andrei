import { describe, expect, it } from "vitest";
import { slimWorkspaceComments } from "./slim-workspace-comments";

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

  it("drops resolved and dismissed AI suggestion bodies", () => {
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
          kind: "human",
          status: "resolved",
          content: "Please clarify.",
        },
      ])
    ).toEqual([
      { kind: "ai_fix", status: "resolved", content: "" },
      { kind: "ai_redraft", status: "resolved", content: "" },
      { kind: "human", status: "resolved", content: "Please clarify." },
    ]);
  });
});
