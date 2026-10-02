import { describe, expect, it } from "vitest";
import {
  createInsertRowsQueues,
  createSameTurnTableInserts,
  enqueueInsertRows,
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

describe("enqueueInsertRows", () => {
  it("serializes the same table and leaves other keys free", async () => {
    // Hang regression: a blocked Table 3 insert_rows must not stall
    // edit_cells (or insert_rows on another table) behind it.
    const queues = createInsertRowsQueues();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = enqueueInsertRows(queues, "table-a", async () => {
      order.push("a-start");
      await firstGate;
      order.push("a-end");
      return "a";
    });
    const second = enqueueInsertRows(queues, "table-a", async () => {
      order.push("a-second");
      return "a2";
    });
    const other = enqueueInsertRows(queues, "table-b", async () => {
      order.push("b");
      return "b";
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["a-start", "b"]);
    releaseFirst();
    await expect(Promise.all([first, second, other])).resolves.toEqual([
      "a",
      "a2",
      "b",
    ]);
    expect(order).toEqual(["a-start", "b", "a-end", "a-second"]);
  });

  it("runs the next same-key call after a rejected predecessor", async () => {
    const queues = createInsertRowsQueues();
    const first = enqueueInsertRows(queues, "table-a", async () => {
      throw new Error("boom");
    });
    const second = enqueueInsertRows(queues, "table-a", async () => "ok");
    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe("ok");
  });
});
