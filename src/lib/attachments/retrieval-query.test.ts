import { describe, expect, it } from "vitest";
import {
  classifyRetrievalQuery,
  collapseToBestChunkPerPage,
} from "./retrieval-query";

describe("classifyRetrievalQuery", () => {
  it("extracts requirement-like identifiers", () => {
    expect(classifyRetrievalQuery("Where is SW-LWB-4 listed?")).toEqual({
      kind: "identifier",
      identifiers: ["SW-LWB-4"],
    });
  });

  it("treats page and filename wording as locators when no id is present", () => {
    expect(
      classifyRetrievalQuery("appendix-b-790-00134r-revu.pdf page 31").kind
    ).toBe("locator");
  });

  it("does not treat dissolution prose as an identifier", () => {
    expect(classifyRetrievalQuery("dissolution failure")).toEqual({
      kind: "semantic",
      identifiers: [],
    });
  });

  it("does not treat B-441 as a requirement id", () => {
    expect(classifyRetrievalQuery("Batch B-441 failed dissolution").kind).toBe(
      "semantic"
    );
  });
});

describe("collapseToBestChunkPerPage", () => {
  it("keeps the first chunk per attachment page", () => {
    const collapsed = collapseToBestChunkPerPage([
      { attachmentId: "a", pageNumber: 1, chunkId: "c1" },
      { attachmentId: "a", pageNumber: 1, chunkId: "c2" },
      { attachmentId: "a", pageNumber: 2, chunkId: "c3" },
    ]);
    expect(collapsed.map((row) => row.chunkId)).toEqual(["c1", "c3"]);
  });
});
