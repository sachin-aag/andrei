import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { compactChatToolHistoryForModel, compactInTurnModelMessages } from "./compact-tool-history";

describe("compactChatToolHistoryForModel", () => {
  it("replaces bulky finish findings with a page-citation digest", () => {
    const findings = Array.from({ length: 80 }, (_, i) => ({
      id: `d${i + 1}`,
      filename: "Protocol.pdf",
      pageNumber: i + 1,
      identifiers: i === 0 ? ["AC-100"] : [],
      summary: `Finding on page ${i + 1} with extra detail that should truncate when very long ${"x".repeat(200)}`,
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
        citationDigest?: Array<{
          filename: string;
          pageNumber: number;
          citation: string;
          identifiers: string[];
          summary: string;
        }>;
      };
    };
    expect(part.output?.findings).toEqual([]);
    expect(part.output?.findingsOmitted).toBe(80);
    expect(part.output?.allIdentifiers).toEqual(["AC-100"]);
    expect(part.output?.citationDigest).toHaveLength(60);
    expect(part.output?.citationDigest?.[0]).toMatchObject({
      filename: "Protocol.pdf",
      pageNumber: 1,
      citation: "[Protocol.pdf, p. 1]",
      identifiers: ["AC-100"],
    });
    expect(part.output?.citationDigest?.[0]?.summary.length).toBeLessThanOrEqual(
      160
    );
  });

  it("keeps reviewedEvidence page pointers when compacting finish findings", () => {
    const reviewedEvidence = Array.from({ length: 80 }, (_, i) => ({
      attachmentId: "att-1",
      filename: "Protocol.pdf",
      pageNumber: i + 1,
    }));
    const findings = Array.from({ length: 80 }, (_, i) => ({
      id: `d${i + 1}`,
      filename: "Protocol.pdf",
      pageNumber: i + 1,
      identifiers: [],
      summary: `Finding ${i + 1}`,
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
              reviewedPages: 80,
              findings,
              reviewedEvidence,
            },
          },
        ],
      },
    ];
    const compacted = compactChatToolHistoryForModel(messages);
    const part = compacted[0]?.parts[0] as {
      output?: {
        findings?: unknown[];
        reviewedEvidence?: Array<{ pageNumber: number }>;
      };
    };
    expect(part.output?.findings).toEqual([]);
    expect(part.output?.reviewedEvidence).toHaveLength(80);
    expect(part.output?.reviewedEvidence?.[79]?.pageNumber).toBe(80);
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
              nextPage: 4,
              continuation: {
                citation: "[Protocol.pdf, p. 4]",
                page: {
                  attachmentId: "att_1",
                  filename: "Protocol.pdf",
                  pageNumber: 4,
                  transcript: "z".repeat(2_000),
                  visualInterpretation: "",
                  pageContext: "Table 2 continued",
                },
              },
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
        continuation?: {
          page?: {
            transcript?: string;
            transcriptOmittedChars?: number;
          };
        };
      };
    };
    expect(part.output?.citation).toBe("[Protocol.pdf, p. 3]");
    expect(part.output?.page?.transcript).toBe("");
    expect(part.output?.page?.visualInterpretation).toBe("");
    expect(part.output?.page?.transcriptOmittedChars).toBe(5_000);
    expect(part.output?.page?.visualOmittedChars).toBe(1_000);
    expect(part.output?.page?.pageContext).toBe("Table 2");
    expect(part.output?.continuation?.page?.transcript).toBe("");
    expect(part.output?.continuation?.page?.transcriptOmittedChars).toBe(2_000);
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

describe("compactInTurnModelMessages", () => {
  it("keeps the last two search_documents excerpts and digests older ones to citations", () => {
    const search = (id: string, excerpt: string) => ({
      role: "tool" as const,
      content: [
        {
          type: "tool-result" as const,
          toolCallId: id,
          toolName: "search_documents",
          output: {
            type: "json" as const,
            value: {
              results: [
                {
                  filename: "Protocol.pdf",
                  pageNumber: 4,
                  citation: "[Protocol.pdf, p. 4]",
                  excerpt,
                  attachmentId: "att-1",
                },
              ],
            },
          },
        },
      ],
    });
    const compacted = compactInTurnModelMessages([
      search("s1", "old excerpt one"),
      search("s2", "recent excerpt two"),
      search("s3", "recent excerpt three"),
    ]);
    const first = compacted[0]?.content[0]?.output as {
      value?: { results?: Array<{ excerpt?: string; citation?: string }>; excerptsOmitted?: boolean };
    };
    expect(first.value?.excerptsOmitted).toBe(true);
    expect(first.value?.results?.[0]?.citation).toBe("[Protocol.pdf, p. 4]");
    expect(first.value?.results?.[0]?.excerpt).toBeUndefined();
    const third = compacted[2]?.content[0]?.output as {
      value?: { results?: Array<{ excerpt?: string }> };
    };
    expect(third.value?.results?.[0]?.excerpt).toBe("recent excerpt three");
  });

  it("keeps the latest page transcript and a quoted span on older reads", () => {
    const page = (id: string, transcript: string) => ({
      role: "tool" as const,
      content: [
        {
          type: "tool-result" as const,
          toolCallId: id,
          toolName: "read_document_page",
          output: {
            type: "json" as const,
            value: {
              page: {
                filename: "Protocol.pdf",
                pageNumber: 4,
                transcript,
                visualInterpretation: "layout",
              },
            },
          },
        },
      ],
    });
    const long = "Calibration due 12 Mar 2025. ".repeat(40);
    const compacted = compactInTurnModelMessages([
      page("p1", long),
      page("p2", "Latest page transcript stays in full."),
    ]);
    const oldPage = compacted[0]?.content[0]?.output as {
      value?: { page?: { transcript?: string; transcriptOmittedChars?: number } };
    };
    expect(oldPage.value?.page?.transcript?.startsWith("Calibration due")).toBe(
      true
    );
    expect(oldPage.value?.page?.transcript?.length).toBeLessThanOrEqual(400);
    expect(oldPage.value?.page?.transcriptOmittedChars).toBeGreaterThan(0);
    const latest = compacted[1]?.content[0]?.output as {
      value?: { page?: { transcript?: string } };
    };
    expect(latest.value?.page?.transcript).toBe(
      "Latest page transcript stays in full."
    );
  });

  it("always digests finish_document_review findings to citationDigest", () => {
    const compacted = compactInTurnModelMessages([
      {
        role: "tool" as const,
        content: [
          {
            type: "tool-result" as const,
            toolCallId: "f1",
            toolName: "finish_document_review",
            output: {
              type: "json" as const,
              value: {
                status: "complete",
                findings: [
                  {
                    filename: "Protocol.pdf",
                    pageNumber: 4,
                    identifiers: ["PMC/PR/014"],
                    summary: "PM due date 12 Mar 2025",
                  },
                ],
              },
            },
          },
        ],
      },
    ]);
    const finish = compacted[0]?.content[0]?.output as {
      value?: {
        findings?: unknown[];
        citationDigest?: Array<{ citation?: string }>;
      };
    };
    expect(finish.value?.findings).toEqual([]);
    expect(finish.value?.citationDigest?.[0]?.citation).toBe(
      "[Protocol.pdf, p. 4]"
    );
  });
});
