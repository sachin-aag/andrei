import { describe, expect, it } from "vitest";
import {
  omitDocumentPreviewPage,
  resolveDocumentPreviewOpen,
} from "./document-preview-page";

describe("resolveDocumentPreviewOpen", () => {
  it("opens a new file on page 1 when nothing was remembered", () => {
    expect(
      resolveDocumentPreviewOpen({
        previewPageById: {},
        lastViewedPage: undefined,
        attachmentId: "att-1",
        requestedPage: undefined,
      })
    ).toEqual({
      page: 1,
      skipJump: false,
      previewPageById: { "att-1": 1 },
    });
  });

  it("restores the last scrolled page after the tab was closed", () => {
    expect(
      resolveDocumentPreviewOpen({
        previewPageById: {},
        lastViewedPage: 12,
        attachmentId: "att-1",
        requestedPage: undefined,
      })
    ).toEqual({
      page: 12,
      skipJump: false,
      previewPageById: { "att-1": 12 },
    });
  });

  it("does not replace the jump target when the tab is already open", () => {
    const previewPageById = { "att-1": 1 };
    expect(
      resolveDocumentPreviewOpen({
        previewPageById,
        lastViewedPage: 12,
        attachmentId: "att-1",
        requestedPage: undefined,
      })
    ).toEqual({
      page: 1,
      skipJump: true,
      previewPageById,
    });
  });

  it("jumps when an explicit page is requested (citation)", () => {
    expect(
      resolveDocumentPreviewOpen({
        previewPageById: { "att-1": 1 },
        lastViewedPage: 12,
        attachmentId: "att-1",
        requestedPage: 3,
      })
    ).toEqual({
      page: 3,
      skipJump: false,
      previewPageById: { "att-1": 3 },
    });
  });

  it("clamps a non-positive explicit page to 1", () => {
    expect(
      resolveDocumentPreviewOpen({
        previewPageById: {},
        lastViewedPage: undefined,
        attachmentId: "att-1",
        requestedPage: 0,
      }).page
    ).toBe(1);
  });
});

describe("omitDocumentPreviewPage", () => {
  it("drops the closed tab's jump target so a later open can restore", () => {
    expect(omitDocumentPreviewPage({ "att-1": 1, "att-2": 4 }, "att-1")).toEqual({
      "att-2": 4,
    });
  });

  it("returns the same map when the id is not present", () => {
    const previewPageById = { "att-1": 1 };
    expect(omitDocumentPreviewPage(previewPageById, "att-2")).toBe(
      previewPageById
    );
  });
});
