import { describe, expect, it } from "vitest";
import { rtmDraftLoopDirective } from "@/lib/ai/chat/rtm-draft-loop";
import type { SearchLoopStep } from "@/lib/ai/chat/search-loop";

function draftStep(
  id: string,
  missingUrsIds: string[]
): SearchLoopStep {
  return {
    toolCalls: [{ toolName: "draft_rtm_table", toolCallId: id }],
    toolResults: [
      {
        toolName: "draft_rtm_table",
        toolCallId: id,
        output: { status: "proposed", missingUrsIds },
      },
    ],
  };
}

describe("rtmDraftLoopDirective", () => {
  it("continues when no RTM draft ran", () => {
    expect(rtmDraftLoopDirective([])).toBe("continue");
  });

  it("forces another draft while reviewed URS IDs are missing", () => {
    expect(rtmDraftLoopDirective([draftStep("d1", ["URS-21"])])).toBe("force");
  });

  it("continues once the missing list is empty", () => {
    expect(
      rtmDraftLoopDirective([
        draftStep("d1", ["URS-21"]),
        draftStep("d2", []),
      ])
    ).toBe("continue");
  });

  it("caps at two continuations", () => {
    expect(
      rtmDraftLoopDirective([
        draftStep("d1", ["URS-21"]),
        draftStep("d2", ["URS-21"]),
        draftStep("d3", ["URS-21"]),
      ])
    ).toBe("continue");
  });
});
