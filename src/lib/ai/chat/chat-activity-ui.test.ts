import { describe, expect, it } from "vitest";
import {
  buildChatActivityBlocks,
  readChatToolPart,
} from "@/lib/ai/chat/chat-activity-ui";

function toolPart(
  toolName: string,
  state: string,
  input?: Record<string, unknown>,
  output?: Record<string, unknown>
) {
  return {
    type: `tool-${toolName}`,
    state,
    toolCallId: `call_${toolName}`,
    input,
    output,
  };
}

describe("buildChatActivityBlocks", () => {
  it("groups consecutive document tools into one surface line", () => {
    const blocks = buildChatActivityBlocks([
      toolPart("search_documents", "output-available", undefined, {
        seenPages: [{ filename: "Protocol.pdf", pageNumber: 3 }],
        results: [{ filename: "Protocol.pdf", pageNumber: 3 }],
      }),
      toolPart(
        "read_document_page",
        "output-available",
        { pageNumber: 3, attachmentId: "att_1" },
        { page: { filename: "Protocol.pdf", pageNumber: 3 } }
      ),
      toolPart(
        "read_document_page",
        "output-available",
        { pageNumber: 4, attachmentId: "att_1" },
        { page: { filename: "Protocol.pdf", pageNumber: 4 } }
      ),
    ] as never);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe("activity");
    if (blocks[0]?.kind !== "activity") return;
    expect(blocks[0].node.kind).toBe("documents");
    expect(blocks[0].node.label).toBe("Read Protocol.pdf");
    expect(blocks[0].node.expandable).toBe(true);
    expect(blocks[0].node.children).toHaveLength(3);
    expect(blocks[0].node.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Searched Protocol.pdf" }),
        expect.objectContaining({ label: "Read Protocol.pdf · page 3" }),
        expect.objectContaining({ label: "Read Protocol.pdf · page 4" }),
      ])
    );
  });

  it("names the attachment on a search-only line", () => {
    const blocks = buildChatActivityBlocks([
      toolPart("search_documents", "output-available", undefined, {
        seenPages: [
          { filename: "Assay COA.pdf", pageNumber: 1 },
          { filename: "Assay COA.pdf", pageNumber: 4 },
        ],
      }),
    ] as never);

    expect(blocks).toHaveLength(1);
    if (blocks[0]?.kind !== "activity") return;
    expect(blocks[0].node.label).toBe("Searched Assay COA.pdf");
    expect(blocks[0].node.children[0]).toEqual(
      expect.objectContaining({ label: "Searched Assay COA.pdf" })
    );
  });

  it("resolves a pending page read from the attachment id lookup", () => {
    const blocks = buildChatActivityBlocks(
      [
        toolPart("read_document_page", "input-available", {
          pageNumber: 2,
          attachmentId: "att_protocol",
        }),
      ] as never,
      new Map([["att_protocol", "Protocol.pdf"]])
    );

    expect(blocks).toHaveLength(1);
    if (blocks[0]?.kind !== "activity") return;
    expect(blocks[0].node.pending).toBe(true);
    expect(blocks[0].node.label).toBe("Reading Protocol.pdf…");
    expect(blocks[0].node.children[0]).toEqual(
      expect.objectContaining({
        label: "Reading Protocol.pdf · page 2…",
      })
    );
  });

  it("updates the pending document count while reads stream in", () => {
    const blocks = buildChatActivityBlocks([
      toolPart("search_documents", "output-available"),
      toolPart("read_document_page", "input-available", { pageNumber: 2 }),
    ] as never);

    const activity = blocks[0];
    expect(activity?.kind).toBe("activity");
    if (activity?.kind !== "activity") return;
    expect(activity.node.pending).toBe(true);
    expect(activity.node.label).toBe("Searching and reading 2 documents…");
  });

  it("nests interleaved thoughts inside the document group", () => {
    const blocks = buildChatActivityBlocks([
      toolPart("search_documents", "output-available"),
      { type: "reasoning", text: "Checking the protocol appendix.", state: "done" },
      toolPart("read_document_page", "output-available", { pageNumber: 8 }),
    ] as never);

    expect(blocks).toHaveLength(1);
    if (blocks[0]?.kind !== "activity") return;
    expect(blocks[0].node.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "thought", text: "Checking the protocol appendix." }),
        expect.objectContaining({ kind: "detail", label: expect.stringContaining("Read page 8") }),
      ])
    );
  });

  it("shows a standalone thought line outside document groups", () => {
    const blocks = buildChatActivityBlocks([
      { type: "reasoning", text: "Planning the next edit.", state: "done" },
      toolPart("propose_edit", "output-available", { section: "define" }, { status: "applied" }),
    ] as never);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.kind).toBe("activity");
    if (blocks[0]?.kind !== "activity") return;
    expect(blocks[0].node.kind).toBe("thought");
    expect(blocks[0].node.thoughtText).toBe("Planning the next edit.");
  });

  it("collapses edit failures to Edit attempted with hidden detail", () => {
    const blocks = buildChatActivityBlocks([
      toolPart(
        "edit_table",
        "output-available",
        { section: "test_results" },
        { status: "not_found", hint: "Could not locate table index 2." }
      ),
      toolPart(
        "edit_table",
        "output-available",
        { section: "test_results" },
        { status: "ambiguous", hint: "Multiple tables matched." }
      ),
    ] as never);

    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block.kind).toBe("activity");
      if (block.kind !== "activity") continue;
      expect(block.node.label).toBe("Edit attempted");
      expect(block.node.expandable).toBe(true);
      expect(block.node.children[0]).toEqual(
        expect.objectContaining({ kind: "detail" })
      );
    }
  });

  it("groups consecutive section reads", () => {
    const blocks = buildChatActivityBlocks([
      toolPart("read_section", "output-available", { section: "define" }),
      toolPart("read_section", "output-available", { section: "measure" }),
    ] as never);

    expect(blocks).toHaveLength(1);
    if (blocks[0]?.kind !== "activity") return;
    expect(blocks[0].node.label).toBe("Read 2 sections");
    expect(blocks[0].node.children).toHaveLength(2);
  });

  it("keeps document review as its own block", () => {
    const blocks = buildChatActivityBlocks([
      toolPart("start_document_review", "output-available", undefined, {
        status: "started",
        totalPages: 12,
      }),
    ] as never);

    expect(blocks[0]?.kind).toBe("document-review");
  });
});

describe("readChatToolPart", () => {
  it("parses tool parts from ui messages", () => {
    expect(
      readChatToolPart({
        type: "tool-search_documents",
        state: "input-available",
        toolCallId: "call_1",
      } as never)
    ).toEqual(
      expect.objectContaining({
        toolName: "search_documents",
        state: "input-available",
      })
    );
  });
});
