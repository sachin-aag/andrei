import { describe, expect, it } from "vitest";
import type { CommentRecord } from "@/types/report";
import {
  applyIdentityPatchToReport,
  foldIdentityPayload,
  identitySnapshotMap,
  identitySuggestionInsertText,
  mergeIdentitySuggestion,
  parseIdentityOperation,
  proposedIdentityValue,
  remainingRequiredAfterIdentityIntent,
} from "./identity-suggestion";

const qsrLive = {
  documentNo: "",
  date: new Date("2026-01-01T00:00:00.000Z"),
  metadata: {},
};

function comment(content: unknown): CommentRecord {
  return {
    id: "c1",
    reportId: "r1",
    parentId: null,
    sectionId: null,
    section: "identity" as CommentRecord["section"],
    authorId: "ai",
    content: JSON.stringify(content),
    anchorText: "",
    contentPath: "documentNo",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    source: "ai",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    evaluationId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("parseIdentityOperation", () => {
  it("keeps string field patches and drops junk", () => {
    expect(
      parseIdentityOperation({
        fields: [
          { key: "documentNo", value: "QSR/GLR-1301" },
          { key: " ", value: "nope" },
          { key: "equipmentName" },
          null,
        ],
      })
    ).toEqual({
      fields: [{ key: "documentNo", value: "QSR/GLR-1301" }],
    });
  });
});

describe("identitySuggestionInsertText", () => {
  it("joins labels for the card preview", () => {
    expect(
      identitySuggestionInsertText("qualification_summary_report", {
        fields: [
          { key: "documentNo", value: "QSR/GLR-1301" },
          { key: "equipmentName", value: "Glass Lined Reactor" },
        ],
      })
    ).toBe("Report No.: QSR/GLR-1301; Equipment / System: Glass Lined Reactor");
  });
});

describe("foldIdentityPayload", () => {
  it("keeps the first base for old keys and adds base for new keys", () => {
    const folded = foldIdentityPayload(
      {
        identityOperation: {
          fields: [{ key: "equipmentName", value: "Old" }],
        },
        suggestionBase: { equipmentName: "" },
        suggestionIntent: { equipmentName: "Old" },
        insertText: "Equipment / System: Old",
        reasoning: "first",
      },
      {
        identityOperation: {
          fields: [{ key: "documentNo", value: "QSR/1" }],
        },
        suggestionBase: { equipmentName: "typed", documentNo: "" },
        suggestionIntent: { documentNo: "QSR/1" },
        insertText: "Report No.: QSR/1",
        reasoning: "second",
      }
    );
    expect(folded.identityOperation?.fields).toEqual([
      { key: "equipmentName", value: "Old" },
      { key: "documentNo", value: "QSR/1" },
    ]);
    expect(folded.suggestionBase).toEqual({
      equipmentName: "",
      documentNo: "",
    });
    expect(folded.suggestionIntent).toEqual({
      equipmentName: "Old",
      documentNo: "QSR/1",
    });
  });
});

describe("mergeIdentitySuggestion", () => {
  it("applies when live matches base or is empty", () => {
    const result = mergeIdentitySuggestion({
      documentType: "qualification_summary_report",
      live: qsrLive,
      base: { documentNo: "", equipmentName: "" },
      intent: {
        documentNo: "QSR/GLR-1301",
        equipmentName: "Glass Lined Reactor",
      },
    });
    expect(result.status).toBe("applied");
    if (result.status === "already_present") return;
    expect(result.applied).toEqual(["documentNo", "equipmentName"]);
    expect(result.documentNo).toBe("QSR/GLR-1301");
    expect(result.metadata).toMatchObject({
      equipmentName: "Glass Lined Reactor",
    });
  });

  it("keeps a live edit as a conflict and still applies compatible fields", () => {
    const result = mergeIdentitySuggestion({
      documentType: "qualification_summary_report",
      live: {
        ...qsrLive,
        documentNo: "QSR/TYPED",
        metadata: { equipmentName: "" },
      },
      base: { documentNo: "", equipmentName: "" },
      intent: {
        documentNo: "QSR/GLR-1301",
        equipmentName: "Glass Lined Reactor",
      },
    });
    expect(result.status).toBe("conflict");
    if (result.status === "already_present") return;
    expect(result.applied).toEqual(["equipmentName"]);
    expect(result.documentNo).toBeUndefined();
    expect(result.skipped).toEqual([
      { key: "documentNo", reason: "conflict" },
    ]);
  });

  it("returns already_present when live already matches intent", () => {
    const result = mergeIdentitySuggestion({
      documentType: "qualification_summary_report",
      live: {
        ...qsrLive,
        documentNo: "QSR/GLR-1301",
        metadata: { equipmentName: "Glass Lined Reactor" },
      },
      base: { documentNo: "", equipmentName: "" },
      intent: {
        documentNo: "QSR/GLR-1301",
        equipmentName: "Glass Lined Reactor",
      },
    });
    expect(result.status).toBe("already_present");
  });
});

describe("remainingRequiredAfterIdentityIntent", () => {
  it("scores completeness from the proposed header, not the live row", () => {
    expect(
      remainingRequiredAfterIdentityIntent(
        "qualification_summary_report",
        qsrLive,
        {
          documentNo: "QSR/GLR-1301",
          equipmentName: "Glass Lined Reactor",
          equipmentCode: "GLR-1301",
          capacity: "8 KL",
          plantSection: "Production Block-2",
          revision: "00",
        }
      )
    ).toEqual([]);
    expect(
      remainingRequiredAfterIdentityIntent(
        "qualification_summary_report",
        qsrLive,
        { equipmentName: "Glass Lined Reactor" }
      )
    ).toContain("documentNo");
  });
});

describe("proposedIdentityValue", () => {
  it("reads the open identity card", () => {
    const comments = [
      comment({
        identityOperation: {
          fields: [{ key: "documentNo", value: "QSR/1" }],
        },
        suggestionIntent: { documentNo: "QSR/1" },
      }),
    ];
    expect(proposedIdentityValue(comments, "documentNo")).toBe("QSR/1");
    expect(proposedIdentityValue(comments, "equipmentName")).toBeUndefined();
  });

  it("keeps ELR title-page dates as written", () => {
    const comments = [
      comment({
        identityOperation: {
          fields: [{ key: "periodFrom", value: "01-Apr-2025" }],
        },
        suggestionIntent: { periodFrom: "01-Apr-2025" },
      }),
    ];
    expect(proposedIdentityValue(comments, "periodFrom")).toBe("01-Apr-2025");
  });
});

describe("applyIdentityPatchToReport", () => {
  it("copies applied metadata and the PATCH clock onto the live report", () => {
    const next = applyIdentityPatchToReport(
      {
        documentNo: "S/PR/070",
        date: "2026-01-01T00:00:00.000Z",
        metadata: { periodFrom: "", periodTo: "" },
        updatedAt: "2026-10-01T15:00:00.000Z",
      },
      {
        metadata: { periodFrom: "01/04/2025", periodTo: "31/03/2026" },
        updatedAt: "2026-10-01T15:00:02.000Z",
      }
    );
    expect(next.metadata).toEqual({
      periodFrom: "01/04/2025",
      periodTo: "31/03/2026",
    });
    expect(next.updatedAt).toBe("2026-10-01T15:00:02.000Z");
  });
});

describe("identitySnapshotMap", () => {
  it("reads live catalog values", () => {
    const map = identitySnapshotMap("qualification_summary_report", {
      documentNo: "QSR/GLR-1301",
      date: new Date("2026-01-01T00:00:00.000Z"),
      metadata: { equipmentName: "Glass Lined Reactor" },
    });
    expect(map.documentNo).toBe("QSR/GLR-1301");
    expect(map.equipmentName).toBe("Glass Lined Reactor");
    expect(map.equipmentCode).toBe("");
  });
});
