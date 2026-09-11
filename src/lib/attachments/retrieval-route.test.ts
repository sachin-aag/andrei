import { describe, expect, it } from "vitest";
import {
  routeSearchTargets,
  routedAttachmentIds,
} from "./retrieval-route";

const software = {
  attachmentId: "att_sw",
  filename: "software-requirements.pdf",
  documentSummary: "Software requirements including SW-EVAL-7 laser interlock.",
};

const protocol = {
  attachmentId: "att_dv",
  filename: "dv-protocol-equipment.pdf",
  documentSummary: "Required testing equipment and executed log.",
};

describe("routeSearchTargets", () => {
  it("does not restrict semantic queries", () => {
    expect(
      routeSearchTargets({
        query: "laser interlock latency requirement",
        documents: [software, protocol],
      })
    ).toEqual([]);
  });

  it("routes a filename locator to that attachment", () => {
    expect(
      routeSearchTargets({
        query: "software-requirements.pdf",
        documents: [software, protocol],
      })
    ).toEqual([
      {
        attachmentId: "att_sw",
        pageStart: null,
        pageEnd: null,
      },
    ]);
  });

  it("routes an identifier to matching outline spans before the whole file", () => {
    const targets = routeSearchTargets({
      query: "SW-EVAL-7",
      documents: [software, protocol],
      spans: [
        {
          attachmentId: "att_sw",
          pageStart: 2,
          pageEnd: 2,
          identifiers: ["SW-EVAL-7", "SW-EVAL-8"],
        },
        {
          attachmentId: "att_dv",
          pageStart: 1,
          pageEnd: 3,
          identifiers: ["TOP-EVAL-01"],
        },
      ],
    });
    expect(targets).toEqual([
      {
        attachmentId: "att_sw",
        pageStart: 2,
        pageEnd: 2,
      },
    ]);
    expect(routedAttachmentIds(targets)).toEqual(["att_sw"]);
  });

  it("falls back to a document_summary identifier hit when no span matches", () => {
    expect(
      routeSearchTargets({
        query: "SW-EVAL-7",
        documents: [software, protocol],
        spans: [],
      })
    ).toEqual([
      {
        attachmentId: "att_sw",
        pageStart: null,
        pageEnd: null,
      },
    ]);
  });

  it("routes an identifier that appears in the filename", () => {
    expect(
      routeSearchTargets({
        query: "SW-EVAL-7",
        documents: [
          {
            attachmentId: "att_named",
            filename: "SW-EVAL-7-interlock.pdf",
            documentSummary: null,
          },
          protocol,
        ],
      })
    ).toEqual([
      {
        attachmentId: "att_named",
        pageStart: null,
        pageEnd: null,
      },
    ]);
  });

  it("does not treat a page-only locator as a file filter", () => {
    expect(
      routeSearchTargets({
        query: "page 2",
        documents: [software, protocol],
      })
    ).toEqual([]);
  });
});
