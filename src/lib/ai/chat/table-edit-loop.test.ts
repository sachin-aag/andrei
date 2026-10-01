import { describe, expect, it } from "vitest";
import {
  tableEditLoopDirective,
  type ChatStepWithTools,
} from "@/lib/ai/chat/table-edit-loop";

function step(
  calls: Array<{ id: string; name: string }>,
  results: Array<{ id: string; name: string; output?: unknown }> = []
): ChatStepWithTools {
  return {
    toolCalls: calls.map((call) => ({
      toolCallId: call.id,
      toolName: call.name,
    })),
    toolResults: results.map((result) => ({
      toolCallId: result.id,
      toolName: result.name,
      output: result.output,
    })),
  };
}

describe("tableEditLoopDirective", () => {
  it("forces a fresh section read after the first failed table edit", () => {
    expect(
      tableEditLoopDirective([
        step(
          [{ id: "edit-1", name: "edit_table" }],
          [{ id: "edit-1", name: "edit_table", output: { status: "stale" } }]
        ),
      ])
    ).toBe("reread");
  });

  it("allows one retry after the fresh read", () => {
    expect(
      tableEditLoopDirective([
        step(
          [{ id: "edit-1", name: "edit_table" }],
          [{ id: "edit-1", name: "edit_table", output: { status: "bad_scope" } }]
        ),
        step(
          [{ id: "read-1", name: "read_section" }],
          [{ id: "read-1", name: "read_section", output: { section: "test_results" } }]
        ),
      ])
    ).toBe("continue");
  });

  it("ends tool use after the second failed attempt", () => {
    expect(
      tableEditLoopDirective([
        step(
          [{ id: "edit-1", name: "edit_table" }],
          [{ id: "edit-1", name: "edit_table", output: { status: "stale" } }]
        ),
        step([{ id: "read-1", name: "read_section" }]),
        step(
          [{ id: "edit-2", name: "edit_table" }],
          [{ id: "edit-2", name: "edit_table", output: { status: "invalid" } }]
        ),
      ])
    ).toBe("finish");
  });

  it("starts a document review after review_incomplete instead of ending tools", () => {
    expect(
      tableEditLoopDirective([
        step(
          [{ id: "edit-1", name: "edit_table" }],
          [
            {
              id: "edit-1",
              name: "edit_table",
              output: { status: "review_incomplete" },
            },
          ]
        ),
        step([{ id: "read-1", name: "read_section" }]),
        step(
          [{ id: "edit-2", name: "edit_table" }],
          [
            {
              id: "edit-2",
              name: "edit_table",
              output: { status: "review_incomplete" },
            },
          ]
        ),
      ])
    ).toBe("review");
  });

  it("continues after review_incomplete once start_document_review has run", () => {
    expect(
      tableEditLoopDirective([
        step(
          [{ id: "edit-1", name: "edit_table" }],
          [
            {
              id: "edit-1",
              name: "edit_table",
              output: { status: "review_incomplete" },
            },
          ]
        ),
        step(
          [{ id: "start-1", name: "start_document_review" }],
          [
            {
              id: "start-1",
              name: "start_document_review",
              output: { status: "started" },
            },
          ]
        ),
      ])
    ).toBe("continue");
  });

  it("keeps tools open after unsupported_facts so a search can retry", () => {
    expect(
      tableEditLoopDirective([
        step(
          [{ id: "edit-1", name: "edit_table" }],
          [
            {
              id: "edit-1",
              name: "edit_table",
              output: { status: "unsupported_facts", keepSearchOpen: true },
            },
          ]
        ),
        step([{ id: "read-1", name: "read_section" }]),
        step(
          [{ id: "edit-2", name: "edit_table" }],
          [
            {
              id: "edit-2",
              name: "edit_table",
              output: { status: "unsupported_facts", keepSearchOpen: true },
            },
          ]
        ),
      ])
    ).toBe("continue");
  });

  it("treats a completed edit call without output as a failed attempt", () => {
    expect(
      tableEditLoopDirective([
        step([{ id: "edit-1", name: "edit_table" }]),
        step([{ id: "read-1", name: "read_section" }]),
        step([{ id: "edit-2", name: "edit_table" }]),
      ])
    ).toBe("finish");
  });

  it("continues normally after a successful proposal", () => {
    expect(
      tableEditLoopDirective([
        step(
          [{ id: "edit-1", name: "edit_table" }],
          [{ id: "edit-1", name: "edit_table", output: { status: "proposed" } }]
        ),
      ])
    ).toBe("continue");
  });
});
