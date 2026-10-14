import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/attachments/retrieval", () => ({
  readDocumentPage: vi.fn(),
  searchReportDocuments: vi.fn(),
}));

import { collectCitationSupportJobs } from "@/lib/review/checks/citations-supports";

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
