import { describe, expect, it } from "vitest";
import {
  lastStartNeedsAttachmentScope,
  prepareReportChatStep,
  shouldForceListAttachments,
  type PrepareReportChatStepInput,
} from "./step-policy";
import { createSearchGate, type SearchLoopStep } from "./search-loop";

const ADVERTISED = [
  "read_section",
  "list_attachments",
  "search_documents",
  "read_document_page",
  "document_outline",
  "ask_user",
  "draft_field",
  "propose_edit",
  "edit_table",
  "start_document_review",
  "continue_document_review",
  "finish_document_review",
] as const;

function baseInput(
  overrides: Partial<PrepareReportChatStepInput> = {}
): PrepareReportChatStepInput {
  return {
    advertisedTools: ADVERTISED,
    steps: [],
    userIntentKind: "write",
    alreadyDrafted: false,
    hasReadSectionTool: true,
    inScopeHasTable: false,
    retrievalPolicy: "adaptive",
    reviewPhase: "idle",
    requireInventoryReview: false,
    ...overrides,
  };
}

function searchStep(hits: number): SearchLoopStep {
  return {
    toolCalls: [{ toolName: "search_documents", toolCallId: "s1" }],
    toolResults: [
      {
        toolName: "search_documents",
        toolCallId: "s1",
        output: { returnedCount: hits, results: hits > 0 ? [{}] : [] },
      },
    ],
  };
}

describe("prepareReportChatStep (characterization)", () => {
  it("strips every tool on a greeting", () => {
    expect(
      prepareReportChatStep(baseInput({ userIntentKind: "social" }))
    ).toEqual({ activeTools: [] });
  });

  it("forces read_section on the first already-drafted write", () => {
    expect(
      prepareReportChatStep(
        baseInput({ alreadyDrafted: true, userIntentKind: "write" })
      )
    ).toEqual({
      activeTools: ["read_section"],
      toolChoice: { type: "tool", toolName: "read_section" },
    });
  });

  it("reads, then forces edit_table when they asked to land a suggestion", () => {
    expect(
      prepareReportChatStep(
        baseInput({
          explicitDocumentEdit: true,
          inScopeHasTable: true,
          userIntentKind: "write",
        })
      )
    ).toEqual({
      activeTools: ["read_section"],
      toolChoice: { type: "tool", toolName: "read_section" },
    });
    expect(
      prepareReportChatStep(
        baseInput({
          explicitDocumentEdit: true,
          inScopeHasTable: true,
          userIntentKind: "write",
          steps: [{ toolCalls: [{ toolName: "read_section" }] }],
        })
      )
    ).toEqual({
      activeTools: ["edit_table"],
      toolChoice: { type: "tool", toolName: "edit_table" },
    });
  });

  it("forces propose_edit after read when the landed edit is prose", () => {
    expect(
      prepareReportChatStep(
        baseInput({
          explicitDocumentEdit: true,
          inScopeHasTable: false,
          steps: [{ toolCalls: [{ toolName: "read_section" }] }],
        })
      )
    ).toEqual({
      activeTools: ["propose_edit"],
      toolChoice: { type: "tool", toolName: "propose_edit" },
    });
  });

  it("forces read_section on the first write when a scoped section has a table", () => {
    expect(
      prepareReportChatStep(
        baseInput({ inScopeHasTable: true, userIntentKind: "write" })
      )
    ).toEqual({
      activeTools: ["read_section"],
      toolChoice: { type: "tool", toolName: "read_section" },
    });
  });

  it("hides document-review tools on an adaptive idle turn", () => {
    const decision = prepareReportChatStep(baseInput());
    expect(decision.activeTools).not.toContain("start_document_review");
    expect(decision.activeTools).toContain("search_documents");
    expect(decision.toolChoice).toBeUndefined();
  });

  it("forces start_document_review for comprehensive idle", () => {
    expect(
      prepareReportChatStep(baseInput({ retrievalPolicy: "comprehensive" }))
    ).toEqual({
      activeTools: ["start_document_review"],
      toolChoice: { type: "tool", toolName: "start_document_review" },
    });
  });

  it("forces start_document_review when an empty inventory still needs a matching walk", () => {
    expect(
      prepareReportChatStep(
        baseInput({
          retrievalPolicy: "adaptive",
          requireInventoryReview: true,
        })
      )
    ).toEqual({
      activeTools: ["start_document_review"],
      toolChoice: { type: "tool", toolName: "start_document_review" },
    });
  });

  it("does not restart start_document_review after a truncated matching finish", () => {
    const decision = prepareReportChatStep(
      baseInput({
        retrievalPolicy: "adaptive",
        reviewPhase: "complete",
        requireInventoryReview: true,
        restartInventoryReview: false,
      })
    );
    expect(decision.toolChoice).toBeUndefined();
    expect(decision.activeTools).not.toContain("start_document_review");
    expect(decision.activeTools).toContain("edit_table");
  });

  it("hides search_documents after a cited hit", () => {
    const searchGate = createSearchGate();
    const decision = prepareReportChatStep(
      baseInput({
        steps: [searchStep(3)],
        searchGate,
      })
    );
    expect(decision.activeTools).not.toContain("search_documents");
    expect(searchGate.closed).toBe(true);
  });

  it("keeps search after a cited hit on mixed write-plus-lookup until a draft lands", () => {
    const searchGate = createSearchGate();
    const decision = prepareReportChatStep(
      baseInput({
        steps: [searchStep(3)],
        searchGate,
        livingWorkSeed: {
          intent: "write",
          alsoLookup: true,
          writeOutstanding: true,
          items: [
            {
              id: "lookup:also",
              kind: "lookup",
              key: "also_lookup",
              label: "Follow-up question from this turn",
              state: "queued",
              source: "also_lookup",
            },
          ],
        },
        remainingWorkContext: {
          surface: "document",
          documentType: "investigation_report",
          emptySectionKeys: ["define"],
          queueLive: false,
          writeToolNames: new Set(["draft_field"]),
        },
      })
    );
    expect(decision.activeTools).toContain("search_documents");
    expect(searchGate.closed).toBe(false);
  });

  it("hides search after two empty greps even when a follow-up is due", () => {
    const searchGate = createSearchGate();
    const decision = prepareReportChatStep(
      baseInput({
        steps: [searchStep(0), searchStep(0)],
        searchGate,
        livingWorkSeed: {
          intent: "write",
          alsoLookup: true,
          writeOutstanding: true,
          items: [
            {
              id: "lookup:also",
              kind: "lookup",
              key: "also_lookup",
              label: "Follow-up question from this turn",
              state: "queued",
              source: "also_lookup",
            },
          ],
        },
        remainingWorkContext: {
          surface: "document",
          documentType: "investigation_report",
          emptySectionKeys: ["define"],
          queueLive: false,
          writeToolNames: new Set(["draft_field"]),
        },
      })
    );
    expect(decision.activeTools).not.toContain("search_documents");
    expect(searchGate.closed).toBe(true);
  });

  it("hides update_plan after one successful skip so the queue cannot loop", () => {
    const decision = prepareReportChatStep(
      baseInput({
        advertisedTools: [...ADVERTISED, "update_plan"],
        remainingWorkContext: {
          surface: "document",
          documentType: "investigation_report",
          emptySectionKeys: ["define", "measure"],
          queueLive: true,
          writeToolNames: new Set(["draft_field"]),
        },
        livingWorkSeed: {
          intent: "write",
          alsoLookup: false,
          writeOutstanding: true,
          items: [
            {
              id: "section:measure",
              kind: "section",
              key: "measure",
              label: "Measure",
              state: "queued",
              source: "pending_plan",
            },
          ],
        },
        steps: [
          {
            toolCalls: [
              {
                toolName: "update_plan",
                toolCallId: "u1",
                input: {
                  action: "skip",
                  sectionKey: "measure",
                  reason: "N/A",
                },
              },
            ],
            toolResults: [
              {
                toolName: "update_plan",
                toolCallId: "u1",
                output: { status: "updated", action: "skip" },
              },
            ],
          },
        ],
      })
    );
    expect(decision.activeTools).not.toContain("update_plan");
  });

  it("hides update_plan while a document review is running", () => {
    const decision = prepareReportChatStep(
      baseInput({
        advertisedTools: [...ADVERTISED, "update_plan"],
        reviewPhase: "in_progress",
        remainingWorkContext: {
          surface: "document",
          documentType: "investigation_report",
          emptySectionKeys: ["define"],
          queueLive: true,
          writeToolNames: new Set(["draft_field"]),
        },
      })
    );
    expect(decision.activeTools).not.toContain("update_plan");
  });

  it("hides ask_user after a grep until a page is read", () => {
    const decision = prepareReportChatStep(
      baseInput({ steps: [searchStep(0)] })
    );
    expect(decision.activeTools).not.toContain("ask_user");
    expect(decision.activeTools).toContain("search_documents");
  });

  it("drops draft_field while already-drafted is active after the forced read", () => {
    const decision = prepareReportChatStep(
      baseInput({
        alreadyDrafted: true,
        steps: [
          {
            toolCalls: [{ toolName: "read_section", toolCallId: "r1" }],
            toolResults: [
              { toolName: "read_section", toolCallId: "r1", output: {} },
            ],
          },
        ],
      })
    );
    expect(decision.activeTools).not.toContain("draft_field");
    expect(decision.activeTools).toContain("propose_edit");
    expect(decision.activeTools).not.toContain("start_document_review");
  });

  it("ends tools after a second failed edit_table", () => {
    const failed = (id: string): SearchLoopStep => ({
      toolCalls: [{ toolName: "edit_table", toolCallId: id }],
      toolResults: [
        {
          toolName: "edit_table",
          toolCallId: id,
          output: { status: "not_found" },
        },
      ],
    });
    expect(
      prepareReportChatStep(baseInput({ steps: [failed("a"), failed("b")] }))
    ).toEqual({ activeTools: [] });
  });

  it("does not unlock edit_table after the table-edit finish remap", () => {
    const failed = (id: string): SearchLoopStep => ({
      toolCalls: [{ toolName: "edit_table", toolCallId: id }],
      toolResults: [
        {
          toolName: "edit_table",
          toolCallId: id,
          output: { status: "unsupported_facts" },
        },
      ],
    });
    const remapped: SearchLoopStep = {
      toolCalls: [
        {
          toolName: "unsupported_tool",
          toolCallId: "u1",
          input: { requestedTool: "edit_table" },
        },
      ],
      toolResults: [
        {
          toolName: "unsupported_tool",
          toolCallId: "u1",
          output: { status: "unavailable", requestedTool: "edit_table" },
        },
      ],
    };
    expect(
      prepareReportChatStep(
        baseInput({
          userIntentKind: "write",
          registeredWriteTools: ["edit_table", "draft_field", "propose_edit"],
          steps: [failed("a"), failed("b"), remapped],
        })
      )
    ).toEqual({ activeTools: [] });
  });

  it("does not force list_attachments unless the E2 flag is on", () => {
    const steps: SearchLoopStep[] = [
      {
        toolCalls: [
          { toolName: "start_document_review", toolCallId: "st1" },
        ],
        toolResults: [
          {
            toolName: "start_document_review",
            toolCallId: "st1",
            output: { status: "needs_attachment_scope" },
          },
        ],
      },
    ];
    const withoutFlag = prepareReportChatStep(baseInput({ steps }));
    expect(withoutFlag.activeTools).not.toEqual(["list_attachments"]);
    expect(
      prepareReportChatStep(
        baseInput({ steps, forceListAttachments: true })
      )
    ).toEqual({
      activeTools: ["list_attachments"],
      toolChoice: { type: "tool", toolName: "list_attachments" },
    });
  });

  it("forces finish_document_review when the continue budget is gone", () => {
    expect(
      prepareReportChatStep(
        baseInput({
          reviewPhase: "in_progress",
          forceFinishReview: true,
        })
      )
    ).toEqual({
      activeTools: ["finish_document_review"],
      toolChoice: { type: "tool", toolName: "finish_document_review" },
    });
  });

  it("unlocks registered write tools after a hidden edit_table on a read turn", () => {
    const readAdvertised = [
      "read_section",
      "list_attachments",
      "search_documents",
      "read_document_page",
      "document_outline",
      "ask_user",
      "list_suggestions",
    ] as const;
    const hiddenWrite: SearchLoopStep = {
      toolCalls: [
        {
          toolName: "unsupported_tool",
          toolCallId: "u1",
          input: { requestedTool: "edit_table" },
        },
      ],
      toolResults: [
        {
          toolName: "unsupported_tool",
          toolCallId: "u1",
          output: { status: "unavailable", requestedTool: "edit_table" },
        },
      ],
    };
    const unlocked = prepareReportChatStep(
      baseInput({
        advertisedTools: readAdvertised,
        userIntentKind: "read",
        registeredWriteTools: ["draft_field", "propose_edit", "edit_table"],
        steps: [hiddenWrite],
      })
    );
    expect(unlocked.activeTools).toEqual(
      expect.arrayContaining(["edit_table", "draft_field", "propose_edit"])
    );
    expect(unlocked.toolChoice).toBeUndefined();

    const stillRead = prepareReportChatStep(
      baseInput({
        advertisedTools: readAdvertised,
        userIntentKind: "read",
        registeredWriteTools: ["draft_field", "propose_edit", "edit_table"],
        steps: [],
      })
    );
    expect(stillRead.activeTools).not.toContain("edit_table");
    expect(stillRead.activeTools).toContain("list_suggestions");
  });

  it("does not unlock writes during an active document review", () => {
    const decision = prepareReportChatStep(
      baseInput({
        advertisedTools: ["read_section", "continue_document_review"],
        userIntentKind: "read",
        registeredWriteTools: ["edit_table"],
        reviewPhase: "in_progress",
        steps: [
          {
            toolCalls: [
              {
                toolName: "unsupported_tool",
                input: { requestedTool: "edit_table" },
              },
            ],
          },
        ],
      })
    );
    expect(decision.activeTools).not.toContain("edit_table");
  });
});

describe("lastStartNeedsAttachmentScope", () => {
  it("reads the latest start_document_review payload", () => {
    expect(lastStartNeedsAttachmentScope([])).toBe(false);
    expect(
      lastStartNeedsAttachmentScope([
        {
          toolResults: [
            {
              toolName: "start_document_review",
              output: { status: "needs_attachment_scope" },
            },
          ],
        },
      ])
    ).toBe(true);
    expect(
      lastStartNeedsAttachmentScope([
        {
          toolResults: [
            {
              toolName: "start_document_review",
              output: { status: "started" },
            },
          ],
        },
      ])
    ).toBe(false);
  });
});

describe("shouldForceListAttachments", () => {
  const needsScope: SearchLoopStep = {
    toolResults: [
      {
        toolName: "start_document_review",
        output: { status: "needs_attachment_scope" },
      },
    ],
  };
  const listed: SearchLoopStep = {
    toolResults: [
      {
        toolName: "list_attachments",
        output: { matched: 5, returned: 5, nextOffset: null },
      },
    ],
  };

  it("forces a listing only on the step after needs_attachment_scope", () => {
    expect(shouldForceListAttachments([])).toBe(false);
    expect(shouldForceListAttachments([needsScope])).toBe(true);
    expect(shouldForceListAttachments([needsScope, listed])).toBe(false);
  });

  it("forces a listing again if a later start still needs attachment scope", () => {
    expect(shouldForceListAttachments([needsScope, listed, needsScope])).toBe(
      true
    );
  });

  it("stops locking list_attachments after the listing so start can run", () => {
    expect(
      prepareReportChatStep(
        baseInput({
          retrievalPolicy: "comprehensive",
          reviewPhase: "idle",
          steps: [needsScope, listed],
          forceListAttachments: shouldForceListAttachments([
            needsScope,
            listed,
          ]),
        })
      )
    ).toEqual({
      activeTools: ["start_document_review"],
      toolChoice: { type: "tool", toolName: "start_document_review" },
    });
  });
});
