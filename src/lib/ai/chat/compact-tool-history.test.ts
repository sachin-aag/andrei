import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { compactChatToolHistoryForModel } from "./compact-tool-history";

describe("compactChatToolHistoryForModel", () => {
  it("drops the findings array from a prior finish_document_review part", () => {
    const findings = Array.from({ length: 80 }, (_, i) => ({
      id: `d${i + 1}`,
      pageNumber: i + 1,
      summary: "row",
    }));
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-finish_document_review",
            toolCallId: "call_finish",
            state: "output-available",
            input: {},
            output: {
              status: "complete",
              reviewedPages: 273,
              totalPages: 273,
              findings,
              allIdentifiers: ["AC-100"],
              recommendedInventory: { ids: ["AC-100"], sourceKind: "verified" },
              coverageSummary: "Reviewed 273/273 pages",
            },
          },
        ],
      },
    ];

    const compacted = compactChatToolHistoryForModel(messages);
    const part = compacted[0]?.parts[0] as {
      output?: {
        findings?: unknown[];
        findingsOmitted?: number;
        allIdentifiers?: string[];
      };
    };
    expect(part.output?.findings).toEqual([]);
    expect(part.output?.findingsOmitted).toBe(80);
    expect(part.output?.allIdentifiers).toEqual(["AC-100"]);
  });

  it("leaves other tool parts alone", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-read_section",
            toolCallId: "call_read",
            state: "output-available",
            input: { section: "purpose" },
            output: { section: "purpose", fields: [] },
          },
        ],
      },
    ];
    expect(compactChatToolHistoryForModel(messages)).toEqual(messages);
  });
});
