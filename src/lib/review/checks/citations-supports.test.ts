import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/attachments/retrieval", () => ({
  readDocumentPage: vi.fn(),
  searchReportDocuments: vi.fn(),
}));
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: vi.fn(),
  };
});
vi.mock("@/lib/ai/usage", () => ({
  assertAiBudgetAvailable: vi.fn().mockResolvedValue(undefined),
  recordAiUsage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/ai/resolve-google-language-model", () => ({
  resolveGoogleLanguageModel: vi.fn(() => "mock-model"),
}));

import { generateText } from "ai";
import {
  readDocumentPage,
  searchReportDocuments,
} from "@/lib/attachments/retrieval";
import {
  collectCitationSupportJobs,
  runCitationSupportsCheck,
} from "@/lib/review/checks/citations-supports";
import type { ReviewRunContext } from "@/lib/review/types";

const sections = {
  define: {
    narrative: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Batch BN-99 failed on 12 Jan 2024 [1].",
            },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Citations:" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "1. [batch-record.pdf, p. 2]" }],
        },
      ],
    },
  },
};

describe("collectCitationSupportJobs", () => {
  it("queues a resolvable [n] against its attachment page", () => {
    const { jobs, unresolved } = collectCitationSupportJobs({
      documentType: "investigation_report",
      sections,
      attachmentFilenames: ["batch-record.pdf"],
      attachmentByFilename: new Map([["batch-record.pdf", "att-1"]]),
    });
    expect(unresolved).toEqual([]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      marker: "[1]",
      citationNumber: 1,
      filename: "batch-record.pdf",
      page: 2,
      attachmentId: "att-1",
    });
    expect(jobs[0]?.claim).toContain("Batch BN-99");
  });

  it("uses the table row as the claim so a date keeps its document name", () => {
    const { jobs } = collectCitationSupportJobs({
      documentType: "investigation_report",
      sections: {
        define: {
          narrative: {
            type: "doc",
            content: [
              {
                type: "table",
                content: [
                  {
                    type: "tableRow",
                    content: [
                      {
                        type: "tableHeader",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Document Name" }],
                          },
                        ],
                      },
                      {
                        type: "tableHeader",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Effective Date" }],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "tableRow",
                    content: [
                      {
                        type: "tableCell",
                        content: [
                          {
                            type: "paragraph",
                            content: [
                              { type: "text", text: "Design Qualification" },
                            ],
                          },
                        ],
                      },
                      {
                        type: "tableCell",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "06-11-2025 [1]" }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: "paragraph",
                content: [{ type: "text", text: "Citations:" }],
              },
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "1. [Design Qualification.PDF, p. 1]",
                  },
                ],
              },
            ],
          },
        },
      },
      attachmentFilenames: ["Design Qualification.PDF"],
      attachmentByFilename: new Map([
        ["Design Qualification.PDF", "att-dq"],
      ]),
    });
    expect(jobs[0]?.claim).toContain("Document Name: Design Qualification");
    expect(jobs[0]?.claim).toContain("06-11-2025");
  });

  it("records unresolved markers whose Citations line is not a ready page", () => {
    const { jobs, unresolved } = collectCitationSupportJobs({
      documentType: "investigation_report",
      sections,
      attachmentFilenames: [],
      attachmentByFilename: new Map(),
    });
    expect(jobs).toEqual([]);
    expect(unresolved.some((row) => row.anchorText === "[1]")).toBe(true);
  });
});

function supportCtx(
  overrides: Partial<Pick<ReviewRunContext, "sections">> = {}
): ReviewRunContext {
  return {
    report: { id: "r1", documentNo: "DEV-1", metadata: {} } as never,
    user: { id: "u1" } as never,
    documentType: "investigation_report",
    sections: overrides.sections ?? sections,
    sectionRows: [{ id: "s1", section: "define" }],
    evaluations: [],
    comments: [],
    attachmentFilenames: ["batch-record.pdf"],
    attachmentByFilename: new Map([["batch-record.pdf", "att-1"]]),
    attachmentPages: [{ filename: "batch-record.pdf", pageNumber: 2 }],
  };
}

describe("runCitationSupportsCheck", () => {
  beforeEach(() => {
    process.env.ALLOW_TEST_STUB_REVIEW = "false";
    vi.mocked(generateText).mockReset();
    vi.mocked(readDocumentPage).mockReset();
    vi.mocked(searchReportDocuments).mockReset();
    vi.mocked(searchReportDocuments).mockResolvedValue([]);
  });

  it("skips the model when the cited page has the facts and subject", async () => {
    vi.mocked(readDocumentPage).mockResolvedValue({
      transcript: "Batch BN-99 failed on 12 Jan 2024 during filling.",
    } as never);
    const result = await runCitationSupportsCheck(supportCtx());
    expect(result.findings).toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("flags a neighbour vessel without calling the model", async () => {
    vi.mocked(readDocumentPage).mockResolvedValue({
      transcript:
        "Vessel 2 operating temperature 80 °C. Vessel 1 operating temperature 15 °C.",
    } as never);
    const result = await runCitationSupportsCheck(
      supportCtx({
        sections: {
          define: {
            narrative: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Vessel 1 operating temperature 80 °C [1].",
                    },
                  ],
                },
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Citations:" }],
                },
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "1. [batch-record.pdf, p. 2]" },
                  ],
                },
              ],
            },
          },
        },
      })
    );
    expect(generateText).not.toHaveBeenCalled();
    expect(result.findings[0]).toMatchObject({
      kind: "needs_human",
      severity: "critical",
      anchorText: "[1]",
    });
    expect(result.findings[0]?.message.toLowerCase()).toContain("vessel");
  });

  it("flags a missing date without calling the model", async () => {
    vi.mocked(readDocumentPage).mockResolvedValue({
      transcript: "Batch BN-99 failed during filling. No date recorded.",
    } as never);
    const result = await runCitationSupportsCheck(supportCtx());
    expect(generateText).not.toHaveBeenCalled();
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      kind: "needs_human",
      severity: "critical",
      anchorText: "[1]",
    });
    expect(result.findings[0]?.message).toContain("12 Jan 2024");
  });

  it("asks a human when the model is unsure about the subject", async () => {
    vi.mocked(readDocumentPage).mockResolvedValue({
      transcript: "The agitator was verified as installed.",
    } as never);
    vi.mocked(generateText).mockResolvedValue({
      experimental_output: {
        judgements: [
          {
            index: 0,
            status: "partial",
            reasoning: "OCR does not isolate which agitator this sentence describes.",
          },
        ],
      },
      usage: {},
    } as never);
    const result = await runCitationSupportsCheck(
      supportCtx({
        sections: {
          define: {
            narrative: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "The agitator was verified as installed [1].",
                    },
                  ],
                },
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Citations:" }],
                },
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "1. [batch-record.pdf, p. 2]" },
                  ],
                },
              ],
            },
          },
        },
      })
    );
    expect(generateText).toHaveBeenCalledOnce();
    expect(result.findings[0]).toMatchObject({
      kind: "needs_human",
      severity: "major",
      anchorText: "[1]",
    });
    expect(result.findings[0]?.message).toContain("partial");
  });
});
