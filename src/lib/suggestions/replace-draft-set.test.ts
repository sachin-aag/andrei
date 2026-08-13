import { describe, expect, it, vi } from "vitest";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import { splitMarkdownIntoBlocks } from "@/lib/suggestions/diff-redraft";
import {
  buildDraftSetCards,
  joinAuthoredBlocks,
  type AuthoredDraftBlock,
} from "@/lib/suggestions/replace-draft-set";

vi.mock("@/db", () => ({ db: {} }));

const detection: AuthoredDraftBlock = {
  topic: "Detection",
  reason: "What was found at the station.",
  markdown: "Leak detected at station 3.",
};

const scope: AuthoredDraftBlock = {
  topic: "Scope",
  reason: "Which lots are affected.",
  markdown: "Batches 12 and 14 are quarantined.",
};

describe("joinAuthoredBlocks", () => {
  it("re-split of the joined markdown equals flatMap(split) even with internal blank lines", () => {
    const blocks: AuthoredDraftBlock[] = [
      {
        topic: "Detection",
        reason: "r1",
        markdown: "Para one.\n\nPara one-b.",
      },
      { topic: "Scope", reason: "r2", markdown: "Para two." },
    ];
    const pieces = blocks.flatMap((block) => splitMarkdownIntoBlocks(block.markdown));
    const { markdown, owners } = joinAuthoredBlocks(blocks);
    expect(splitMarkdownIntoBlocks(markdown)).toEqual(pieces);
    expect(owners).toEqual([0, 0, 1]);
  });
});

describe("buildDraftSetCards", () => {
  it("stamps each card with the owning block topic/reason and one fresh draft id", () => {
    const cards = buildDraftSetCards({
      currentDoc: markdownToDoc(""),
      blocks: [detection, scope],
      contentHash: "hash-1",
    });
    expect(cards).toHaveLength(2);
    expect(cards[0]!.payload.label).toBe("Detection");
    expect(cards[0]!.payload.reasoning).toBe(detection.reason);
    expect(cards[1]!.payload.label).toBe("Scope");
    expect(cards[1]!.payload.reasoning).toBe(scope.reason);
    expect(cards[0]!.payload.draft?.index).toBe(1);
    expect(cards[1]!.payload.draft?.index).toBe(2);
    expect(cards[0]!.payload.draft?.total).toBe(2);
    expect(cards[0]!.payload.draft?.id).toBe(cards[1]!.payload.draft?.id);
    expect(cards[1]!.payload.blockEdit?.afterSuggestionId).toBe(cards[0]!.id);
  });

  it("incident replay: revising against live-empty keeps two insert cards, not four", () => {
    const empty = markdownToDoc("");
    const first = buildDraftSetCards({
      currentDoc: empty,
      blocks: [detection, scope],
      contentHash: "hash-1",
    });
    expect(first).toHaveLength(2);
    expect(first.every((c) => c.payload.blockEdit?.op === "insert")).toBe(true);

    const revisedDetection: AuthoredDraftBlock = {
      ...detection,
      markdown: "Leak detected at station 3; residual CO₂ was above spec.",
    };
    const revised = buildDraftSetCards({
      currentDoc: empty,
      blocks: [revisedDetection, scope],
      contentHash: "hash-1",
    });
    expect(revised).toHaveLength(2);
    expect(revised.every((c) => c.payload.blockEdit?.op === "insert")).toBe(true);
    expect(revised[0]!.payload.blockEdit?.proposedMarkdown).toContain("CO₂");
    expect(revised[0]!.payload.draft?.id).not.toBe(first[0]!.payload.draft?.id);
  });
});
