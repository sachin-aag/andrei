import { describe, expect, it } from "vitest";
import {
  annotateContinuationSearchHits,
  continuationPageNumber,
  filenameNamedInObjective,
  isSplitTableSearchHit,
  parsePageOfTotal,
} from "./page-continuation";

describe("parsePageOfTotal", () => {
  it("reads Page N of M", () => {
    expect(parsePageOfTotal("Annexure-I  Page 23 of 24")).toEqual({
      page: 23,
      total: 24,
    });
  });

  it("rejects last-page or inverted ranges", () => {
    expect(parsePageOfTotal("Page 24 of 24")).toEqual({ page: 24, total: 24 });
    expect(parsePageOfTotal("Page 25 of 24")).toBeNull();
    expect(parsePageOfTotal("no footer")).toBeNull();
  });
});

describe("continuationPageNumber", () => {
  it("returns the next PDF page for Page N of M when N < M", () => {
    expect(
      continuationPageNumber({
        pageNumber: 23,
        transcript: "Annexure-I privilege matrix\nPage 23 of 24",
      })
    ).toBe(24);
  });

  it("returns null on the last printed page", () => {
    expect(
      continuationPageNumber({
        pageNumber: 24,
        transcript: "Page 24 of 24\n20 Filling machine",
      })
    ).toBeNull();
  });

  it("treats continued-on-next-page copy as a split", () => {
    expect(
      continuationPageNumber({
        pageNumber: 7,
        quote: "Continued on the next page",
      })
    ).toBe(8);
  });
});

describe("annotateContinuationSearchHits", () => {
  it("marks split-table hits and keeps search open", () => {
    const annotated = annotateContinuationSearchHits([
      {
        pageNumber: 23,
        quote: "Annexure-I Page 23 of 24 Sr. 1 Equipment start",
      },
      {
        pageNumber: 8,
        quote: "Alarm limit table — complete on this page",
      },
    ]);
    expect(annotated.continuationHits).toBe(1);
    expect(annotated.keepSearchOpen).toBe(true);
    expect(annotated.results[0]).toMatchObject({
      continues: true,
      nextPage: 24,
    });
    expect(annotated.results[1]).not.toHaveProperty("continues");
    expect(isSplitTableSearchHit(annotated.results[0]!)).toBe(true);
  });

  it("does not keep search open when no hit is a split table", () => {
    const annotated = annotateContinuationSearchHits([
      { pageNumber: 3, quote: "Certificate 2025/014 due 12/03/2026" },
    ]);
    expect(annotated.keepSearchOpen).toBe(false);
    expect(annotated.continuationHits).toBe(0);
  });
});

describe("filenameNamedInObjective", () => {
  it("matches a distinctive SOP id named in the objective", () => {
    expect(
      filenameNamedInObjective(
        "SOP-DP-PR-040-R01 SOP.pdf",
        "Fill Access Control from SOP-DP-PR-040 privilege matrix"
      )
    ).toBe(true);
  });

  it("does not match an unrelated protocol filename", () => {
    expect(
      filenameNamedInObjective(
        "CSV-IQ-Protocol.pdf",
        "Fill Access Control from the privilege annexure"
      )
    ).toBe(false);
  });
});
