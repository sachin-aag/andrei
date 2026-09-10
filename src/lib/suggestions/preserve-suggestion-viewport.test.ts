import { describe, expect, it } from "vitest";
import { Schema, type Node as PMNode } from "@tiptap/pm/model";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import {
  findSuggestionMarkStartPos,
  mapSuggestionPinPosThroughAccept,
  shiftScrollerToKeepTop,
} from "@/lib/suggestions/preserve-suggestion-viewport";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
  },
  marks: {
    [suggestionInsertMarkName]: {
      attrs: {
        id: { default: null },
        authorId: { default: "" },
        status: { default: "pending" },
        createdAt: { default: "" },
      },
    },
    [suggestionDeleteMarkName]: {
      attrs: {
        id: { default: null },
        authorId: { default: "" },
        status: { default: "pending" },
        createdAt: { default: "" },
      },
    },
  },
});

const MARK_ID = "sug-1";

function insertMark() {
  return schema.marks[suggestionInsertMarkName]!.create({
    id: MARK_ID,
    authorId: "ai",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
}

function deleteMark() {
  return schema.marks[suggestionDeleteMarkName]!.create({
    id: MARK_ID,
    authorId: "ai",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
}

function para(...inline: PMNode[]) {
  return schema.node("paragraph", null, inline);
}

describe("findSuggestionMarkStartPos", () => {
  it("returns the first insert mark, not the preceding delete", () => {
    const doc = schema.node("doc", null, [
      para(
        schema.text("old ", [deleteMark()]),
        schema.text("new text", [insertMark()])
      ),
    ]);
    expect(findSuggestionMarkStartPos(doc, MARK_ID, "insert")).toBe(5);
    expect(findSuggestionMarkStartPos(doc, MARK_ID, "delete")).toBe(1);
  });
});

describe("mapSuggestionPinPosThroughAccept", () => {
  it("maps an inline replace so the insert starts where the delete used to", () => {
    const doc = schema.node("doc", null, [
      para(
        schema.text("keep "),
        schema.text("old", [deleteMark()]),
        schema.text("new", [insertMark()]),
        schema.text(" rest")
      ),
    ]);
    // "keep " = 5 at pos 1; "old" = 3 at pos 6; insert at 9.
    expect(findSuggestionMarkStartPos(doc, MARK_ID, "insert")).toBe(9);
    expect(mapSuggestionPinPosThroughAccept(doc, MARK_ID, "insert")).toBe(6);
  });

  it("drops a fully delete-marked paragraph before a large insert", () => {
    const oldBlock = "A".repeat(80);
    const newBlock = "B".repeat(120);
    const doc = schema.node("doc", null, [
      para(schema.text(oldBlock, [deleteMark()])),
      para(schema.text(newBlock, [insertMark()])),
    ]);
    const insertStart = findSuggestionMarkStartPos(doc, MARK_ID, "insert");
    expect(insertStart).toBe(oldBlock.length + 3);
    expect(mapSuggestionPinPosThroughAccept(doc, MARK_ID, "insert")).toBe(1);
  });

  it("leaves the insert pos alone when nothing is deleted before it", () => {
    const doc = schema.node("doc", null, [
      para(schema.text("prefix "), schema.text("added", [insertMark()])),
    ]);
    expect(findSuggestionMarkStartPos(doc, MARK_ID, "insert")).toBe(8);
    expect(mapSuggestionPinPosThroughAccept(doc, MARK_ID, "insert")).toBe(8);
  });
});

describe("shiftScrollerToKeepTop", () => {
  it("increases scrollTop when the pin jumped up (content above shrank)", () => {
    const scroller = { scrollTop: 400 } as HTMLElement;
    shiftScrollerToKeepTop(scroller, 150, 50);
    expect(scroller.scrollTop).toBe(500);
  });

  it("decreases scrollTop when the pin jumped down (content above grew)", () => {
    const scroller = { scrollTop: 400 } as HTMLElement;
    shiftScrollerToKeepTop(scroller, 150, 250);
    expect(scroller.scrollTop).toBe(300);
  });

  it("leaves scrollTop alone when the pin did not move", () => {
    const scroller = { scrollTop: 400 } as HTMLElement;
    shiftScrollerToKeepTop(scroller, 150, 150);
    expect(scroller.scrollTop).toBe(400);
  });
});
