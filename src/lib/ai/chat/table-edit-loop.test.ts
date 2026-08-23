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
