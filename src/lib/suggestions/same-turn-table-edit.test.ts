import { describe, expect, it } from "vitest";
import {
  createSameTurnTableInserts,
  findTableInsertForFold,
  recordTableInsert,
} from "@/lib/suggestions/same-turn-table-edit";

const payload = {
  deleteText: "",
  insertText: "",
  reasoning: "r",
};

const firstOp = {
  kind: "insert_rows" as const,
  tableIndex: 0,
  afterRow: 0,
  rows: [["Design Qualification"]],
};

describe("findTableInsertForFold", () => {
  it("returns the latest same-table insert_rows card", () => {
    const store = createSameTurnTableInserts();
    recordTableInsert(store, {
      suggestionId: "first",
      section: "qsr_qualification_documents",
      targetField: "table",
      operation: firstOp,
      payload,
    });
    recordTableInsert(store, {
      suggestionId: "other-field",
      section: "qsr_qualification_documents",
      targetField: "narrative",
      operation: firstOp,
      payload,
    });
    recordTableInsert(store, {
      suggestionId: "other-table",
      section: "qsr_qualification_documents",
      targetField: "table",
      operation: { ...firstOp, tableIndex: 1 },
      payload,
    });
    expect(
      findTableInsertForFold(store, {
        section: "qsr_qualification_documents",
        targetField: "table",
        tableIndex: 0,
      })?.suggestionId
    ).toBe("first");
  });

  it("updates the stored operation when the same card is recorded again", () => {
    const store = createSameTurnTableInserts();
    recordTableInsert(store, {
      suggestionId: "one",
      section: "define",
      targetField: "narrative",
      operation: firstOp,
      payload,
    });
    recordTableInsert(store, {
      suggestionId: "one",
      section: "define",
      targetField: "narrative",
      operation: {
        ...firstOp,
        rows: [["Design Qualification"], ["Installation Qualification"]],
      },
      payload: { ...payload, reasoning: "both" },
    });
    expect(store.inserts).toHaveLength(1);
    expect(store.inserts[0]?.operation.rows).toHaveLength(2);
    expect(store.inserts[0]?.payload.reasoning).toBe("both");
  });
});
