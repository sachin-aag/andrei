import { describe, expect, it } from "vitest";
import { parseRetrievalEvalArgs } from "./retrieval-eval";

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
