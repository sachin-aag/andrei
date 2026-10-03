import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { terminologyFindings } from "@/lib/review/checks/writing-terminology";
import { crossReferenceFindings } from "@/lib/review/checks/writing-cross-refs";
import { reviewContentHash } from "@/lib/review/content-hash";

describe("writing review checks", () => {
  it("flags terminology variants against the majority form", () => {
    const findings = terminologyFindings({
      documentType: "investigation_report",
      report: { documentNo: "BN-100", metadata: {} } as never,
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
                    text: "BN-100 was sampled. Later BN100 was quarantined. Then BN-100 was released.",
                  },
                ],
              },
            ],
          },
        },
      },
    });
    expect(findings.some((row) => row.anchorText.replace(/[^A-Z0-9]/gi, "") === "BN100")).toBe(
      true
    );
  });

  it("flags Table N mentions that have no caption", () => {
    const findings = crossReferenceFindings({
      documentType: "investigation_report",
      sections: {
        measure: {
          narrative: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "See Table 4 for the assay results." }],
              },
            ],
          },
        },
      },
    });
    expect(findings.some((row) => row.anchorText === "Table 4")).toBe(true);
  });
});

describe("review content hash", () => {
  it("changes when section content or the salt changes", () => {
    const a = reviewContentHash({ define: { narrative: "one" } }, "report-v1");
    const b = reviewContentHash({ define: { narrative: "two" } }, "report-v1");
    const c = reviewContentHash({ define: { narrative: "one" } }, "report-v2");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
