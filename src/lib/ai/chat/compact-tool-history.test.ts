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

  it("strips transcripts from a prior read_document_page part", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-read_document_page",
            toolCallId: "call_page",
            state: "output-available",
            input: { attachmentId: "att_1", pageNumber: 3 },
            output: {
              status: "found",
              citation: "[Protocol.pdf, p. 3]",
              page: {
                attachmentId: "att_1",
                filename: "Protocol.pdf",
                pageNumber: 3,
                transcript: "x".repeat(5_000),
                visualInterpretation: "y".repeat(1_000),
                pageContext: "Table 2",
              },
            },
          },
        ],
      },
    ];

    const compacted = compactChatToolHistoryForModel(messages);
    const part = compacted[0]?.parts[0] as {
      output?: {
        citation?: string;
        page?: {
          transcript?: string;
          visualInterpretation?: string;
          transcriptOmittedChars?: number;
          visualOmittedChars?: number;
          pageContext?: string;
        };
      };
    };
    expect(part.output?.citation).toBe("[Protocol.pdf, p. 3]");
    expect(part.output?.page?.transcript).toBe("");
    expect(part.output?.page?.visualInterpretation).toBe("");
    expect(part.output?.page?.transcriptOmittedChars).toBe(5_000);
    expect(part.output?.page?.visualOmittedChars).toBe(1_000);
    expect(part.output?.page?.pageContext).toBe("Table 2");
  });

  it("omits bulky write_column value arrays from prior turns", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-write_column",
            toolCallId: "call_write",
            state: "output-available",
            input: {},
            output: {
              status: "ok",
              columns: [
                {
                  columnId: "c1",
                  header: "Assay",
                  values: Array.from({ length: 200 }, (_, i) => i + 0.1),
                },
              ],
            },
          },
        ],
      },
    ];

    const compacted = compactChatToolHistoryForModel(messages);
    const part = compacted[0]?.parts[0] as {
      output?: {
        columns?: Array<{
          values?: unknown[];
          valuesOmitted?: number;
          header?: string;
        }>;
      };
    };
    expect(part.output?.columns?.[0]?.header).toBe("Assay");
    expect(part.output?.columns?.[0]?.values).toEqual([]);
    expect(part.output?.columns?.[0]?.valuesOmitted).toBe(200);
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
