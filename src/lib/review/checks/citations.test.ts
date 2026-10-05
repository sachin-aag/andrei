import { describe, expect, it } from "vitest";
import {
  attachmentIndexFrom,
  citationResolveFindings,
} from "@/lib/review/checks/citations-resolves";
import { uncitedFactFindings } from "@/lib/review/checks/citations-uncited";
import { externalRefFindings } from "@/lib/review/checks/citations-external";

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
              text: "Batch BN-99 failed on 12 Jan 2024 [1]. SOP/QA/012 was not followed.",
            },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Citations:" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "1. [missing-file.pdf, p. 2]" }],
        },
      ],
    },
  },
};

describe("citation review checks", () => {
  it("flags a marker whose Citations line does not resolve to a ready page", () => {
    const findings = citationResolveFindings(
      { documentType: "investigation_report", sections },
      attachmentIndexFrom([])
    );
    expect(findings.some((row) => row.message.includes("[1]"))).toBe(true);
    expect(findings.every((row) => row.severity === "critical")).toBe(true);
  });

  it("accepts a ready attachment page", () => {
    const findings = citationResolveFindings(
      { documentType: "investigation_report", sections },
      attachmentIndexFrom([{ filename: "missing-file.pdf", pageNumber: 2 }])
    );
    expect(findings).toEqual([]);
  });

  it("flags uncited hard facts", () => {
    const findings = uncitedFactFindings({
      documentType: "investigation_report",
      sections: {
        define: {
          narrative: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Batch BN-99 failed on 12 Jan 2024." }],
              },
            ],
          },
        },
      },
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((row) => row.kind === "needs_human")).toBe(true);
    expect(findings.every((row) => row.severity === "major")).toBe(true);
  });

  it("flags SOP numbers that are not in the vault", () => {
    const findings = externalRefFindings({
      documentType: "investigation_report",
      sections,
      attachmentFilenames: ["unrelated.pdf"],
    });
    expect(findings.some((row) => row.anchorText.includes("SOP/QA/012"))).toBe(true);
    expect(findings.every((row) => row.severity === "major")).toBe(true);
  });
});
