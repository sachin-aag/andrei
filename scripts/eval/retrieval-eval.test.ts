import { describe, expect, it } from "vitest";
import { parseRetrievalCases } from "@/lib/attachments/retrieval-metrics";
import {
  mergeRetrievalEvalCases,
  parseRetrievalEvalArgs,
  shouldLoadLocalOverlay,
} from "./retrieval-eval";

describe("parseRetrievalEvalArgs", () => {
  it("defaults to dry-run when no live flag is passed", () => {
    expect(parseRetrievalEvalArgs([])).toMatchObject({
      dryRun: true,
      fromGcs: false,
      live: false,
      reportId: null,
    });
  });

  it("selects the GCS CI path", () => {
    expect(parseRetrievalEvalArgs(["--from-gcs"])).toMatchObject({
      dryRun: false,
      fromGcs: true,
      live: false,
    });
    expect(parseRetrievalEvalArgs(["--", "--from-gcs"])).toMatchObject({
      fromGcs: true,
      dryRun: false,
    });
  });

  it("rejects combining corpus sources", () => {
    expect(() => parseRetrievalEvalArgs(["--from-gcs", "--live"])).toThrow(
      /only one/
    );
    expect(() =>
      parseRetrievalEvalArgs(["--from-gcs", "--report-id", "abc"])
    ).toThrow(/only one/);
  });
});

describe("shouldLoadLocalOverlay", () => {
  it("loads overlay on dry-run and --report-id", () => {
    expect(shouldLoadLocalOverlay(parseRetrievalEvalArgs([]))).toBe(true);
    expect(
      shouldLoadLocalOverlay(parseRetrievalEvalArgs(["--report-id", "abc"]))
    ).toBe(true);
  });

  it("skips overlay on --from-gcs and --live", () => {
    expect(
      shouldLoadLocalOverlay(parseRetrievalEvalArgs(["--from-gcs"]))
    ).toBe(false);
    expect(shouldLoadLocalOverlay(parseRetrievalEvalArgs(["--live"]))).toBe(
      false
    );
  });
});

describe("mergeRetrievalEvalCases", () => {
  const publicCases = parseRetrievalCases([
    {
      id: "public-only",
      query: "SW-EVAL-7",
      kind: "identifier",
      gold: [{ filename: "software-requirements.pdf", page: 2 }],
      passCriteria:
        "Public-only case used to check that overlay merge keeps unmatched ids.",
    },
    {
      id: "shared",
      query: "Required Testing Equipment",
      kind: "semantic",
      gold: [{ filename: "dv-protocol-equipment.pdf", page: 2 }],
      passCriteria:
        "Shared id that the overlay must replace rather than duplicate.",
    },
  ]);

  it("returns public cases when overlay is null or empty", () => {
    expect(mergeRetrievalEvalCases(publicCases, null)).toEqual(publicCases);
    expect(mergeRetrievalEvalCases(publicCases, [])).toEqual(publicCases);
  });

  it("adds overlay-only ids and replaces public cases with the same id", () => {
    const overlay = parseRetrievalCases([
      {
        id: "shared",
        query: "logic analyzer",
        kind: "semantic",
        gold: [
          {
            filename: "Mechanical Test Report Attachments only.pdf",
            page: 121,
            mustContain: ["Saleae"],
          },
        ],
        passCriteria:
          "Overlay replacement must win on id collision for laptop --report-id.",
      },
      {
        id: "overlay-only",
        query: "SW-LWB-4",
        kind: "identifier",
        gold: [],
        mustNotContainAnywhere: ["SW-LWB-4"],
        passCriteria:
          "Overlay-only true negative that the public set does not declare.",
      },
    ]);
    const merged = mergeRetrievalEvalCases(publicCases, overlay);
    expect(merged.map((entry) => entry.id)).toEqual([
      "public-only",
      "shared",
      "overlay-only",
    ]);
    expect(merged.find((entry) => entry.id === "shared")?.query).toBe(
      "logic analyzer"
    );
  });
});
