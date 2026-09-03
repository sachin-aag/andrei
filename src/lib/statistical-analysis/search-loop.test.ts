import { describe, expect, it } from "vitest";
import {
  analyticsDumpReadinessDirective,
  analyticsGatherDirective,
  analyticsManageLoopDirective,
  analyticsPartialDumpDirective,
  analyticsSearchLoopDirective,
  analyticsWriteLoopDirective,
  createAnalyticsSearchGate,
  prepareAnalyticsChatStep,
  type AnalyticsChatStep,
} from "./search-loop";

function step(
  names: string[],
  searchHits?: number
): AnalyticsChatStep {
  const toolCalls = names.map((toolName) => ({ toolName }));
  if (searchHits === undefined) {
    return { toolCalls };
  }
  return {
    toolCalls,
    toolResults: names
      .filter((toolName) => toolName === "search_documents")
      .map((toolName) => ({
        toolName,
        output: { returnedCount: searchHits, seenPages: [] },
      })),
  };
}

describe("analyticsSearchLoopDirective", () => {
  it("lets the first empty grep through and hides search after two empties", () => {
    expect(analyticsSearchLoopDirective([step(["search_documents"], 0)])).toBe(
      "continue"
    );
    expect(
      analyticsSearchLoopDirective([
        step(["search_documents"], 0),
        step(["search_documents"], 0),
      ])
    ).toBe("read");
  });

  it("hides search as soon as a grep returns a cited page", () => {
    expect(analyticsSearchLoopDirective([step(["search_documents"], 3)])).toBe(
      "read"
    );
  });

  it("hides search after a page read, scan, outline, or extract", () => {
    expect(
      analyticsSearchLoopDirective([step(["read_document_page"])])
    ).toBe("read");
    expect(analyticsSearchLoopDirective([step(["scan_attachments"])])).toBe(
      "read"
    );
    expect(analyticsSearchLoopDirective([step(["document_outline"])])).toBe(
      "read"
    );
    expect(
      analyticsSearchLoopDirective([step(["extract_numeric_series"])])
    ).toBe("read");
  });

  it("does not treat read_worksheet as progress that unlocks more greps", () => {
    expect(
      analyticsSearchLoopDirective([
        step(["search_documents"], 0),
        step(["read_worksheet"]),
        step(["search_documents"], 0),
      ])
    ).toBe("read");
  });

  it("hides search after a mixed search-and-read step", () => {
    expect(
      analyticsSearchLoopDirective([
        step(["search_documents", "read_document_page"], 0),
      ])
    ).toBe("read");
  });
});

describe("prepareAnalyticsChatStep", () => {
  it("hides search after two empty greps and keeps write tools when editable", () => {
    const prepared = prepareAnalyticsChatStep({
      steps: [step(["search_documents"], 0), step(["search_documents"], 0)],
      canEdit: true,
    });
    expect(prepared?.activeTools).toContain("read_document_page");
    expect(prepared?.activeTools).toContain("document_outline");
    expect(prepared?.activeTools).toContain("scan_attachments");
    expect(prepared?.activeTools).toContain("write_column");
    expect(prepared?.activeTools).toContain("manage_worksheet");
    expect(prepared?.activeTools).toContain("run_one_way_anova");
    expect(prepared?.activeTools).toContain("plot_measurements");
    expect(prepared?.activeTools).toContain("plot_xy_scatter");
    expect(prepared?.activeTools).toContain("plot_boxplot");
    expect(prepared?.activeTools).toContain("plot_histogram");
    expect(prepared?.activeTools).not.toContain("search_documents");
    expect(
      prepareAnalyticsChatStep({
        steps: [step(["search_documents"], 0), step(["search_documents"], 0)],
        canEdit: false,
      })?.activeTools
    ).not.toContain("write_column");
  });

  it("does not hide search on the first empty grep", () => {
    expect(
      prepareAnalyticsChatStep({
        steps: [step(["search_documents"], 0)],
        canEdit: true,
      })
    ).toBeUndefined();
  });

  it("hides search after the first grep that returns pages", () => {
    const prepared = prepareAnalyticsChatStep({
      steps: [step(["search_documents"], 2)],
      canEdit: true,
    });
    expect(prepared?.activeTools).not.toContain("search_documents");
    expect(prepared?.activeTools).toContain("extract_numeric_series");
    expect(prepared?.activeTools).toContain("read_document_page");
    expect(prepared?.activeTools).toContain("scan_attachments");
    expect(prepared?.activeTools).not.toContain("write_column");
    expect(prepared?.activeTools).not.toContain("ask_user");
    expect(prepared?.activeTools).not.toContain("plot_xy_scatter");
    expect(prepared?.activeTools).toContain("manage_worksheet");
    expect(prepared?.toolChoice).toBe("required");
  });

  it("keeps write tools after many post-search steps — there is no step budget", () => {
    const steps = [
      step(["search_documents"], 2),
      ...Array.from({ length: 40 }, () => step(["extract_numeric_series"])),
    ];
    const prepared = prepareAnalyticsChatStep({ steps, canEdit: true });
    expect(prepared?.activeTools).toContain("write_column");
    expect(prepared?.activeTools).toContain("extract_numeric_series");
    expect(prepared?.activeTools).not.toContain("search_documents");
  });

  it("hides search from AI SDK content parts after a page read", () => {
    const contentStep: AnalyticsChatStep = {
      content: [{ type: "tool-call", toolName: "read_document_page" }],
    };
    expect(analyticsSearchLoopDirective([contentStep])).toBe("read");
    expect(
      prepareAnalyticsChatStep({
        steps: [contentStep],
        canEdit: true,
      })?.activeTools
    ).not.toContain("search_documents");
  });

  it("counts nested search payloads as cited pages", () => {
    expect(
      analyticsSearchLoopDirective([
        {
          toolCalls: [{ toolName: "search_documents" }],
          toolResults: [
            {
              toolName: "search_documents",
              output: {
                type: "json",
                value: { returnedCount: 2, results: [{ pageNumber: 37 }] },
              },
            },
          ],
        },
      ])
    ).toBe("read");
  });

  it("closes the search gate so execute can refuse later greps", () => {
    const searchGate = createAnalyticsSearchGate();
    prepareAnalyticsChatStep({
      steps: [step(["read_document_page"])],
      canEdit: true,
      searchGate,
    });
    expect(searchGate.closed).toBe(true);
  });

  it("strips every tool on a greeting", () => {
    expect(
      prepareAnalyticsChatStep({
        steps: [],
        canEdit: true,
        intent: "social",
      })
    ).toEqual({ activeTools: [] });
  });

  it("hides write tools on a read question before search closes", () => {
    const prepared = prepareAnalyticsChatStep({
      steps: [],
      canEdit: true,
      intent: "read",
    });
    expect(prepared?.activeTools).toContain("search_documents");
    expect(prepared?.activeTools).not.toContain("write_column");
    expect(prepared?.activeTools).not.toContain("plot_xy_scatter");
  });

  it("hides ask_user on a read turn after a cited grep", () => {
    const prepared = prepareAnalyticsChatStep({
      steps: [step(["search_documents"], 2)],
      canEdit: true,
      intent: "read",
    });
    expect(prepared?.activeTools).not.toContain("ask_user");
    expect(prepared?.activeTools).not.toContain("write_column");
    expect(prepared?.activeTools).toContain("read_document_page");
  });
});

function emptyWriteStep(): AnalyticsChatStep {
  return {
    toolCalls: [{ toolName: "write_column" }],
    toolResults: [
      {
        toolName: "write_column",
        output: { status: "written", rowsWritten: 0, blankedCount: 20 },
      },
    ],
  };
}

function filledWriteStep(): AnalyticsChatStep {
  return {
    toolCalls: [{ toolName: "write_column" }],
    toolResults: [
      {
        toolName: "write_column",
        output: { status: "written", rowsWritten: 29, blankedCount: 1 },
      },
    ],
  };
}

describe("analyticsWriteLoopDirective", () => {
  it("lets a successful dump then one blanked dump continue", () => {
    expect(
      analyticsWriteLoopDirective([filledWriteStep(), emptyWriteStep()])
    ).toBe("continue");
  });

  it("stops after two consecutive empty write_column results", () => {
    expect(
      analyticsWriteLoopDirective([
        filledWriteStep(),
        emptyWriteStep(),
        emptyWriteStep(),
      ])
    ).toBe("finish");
  });

  it("hides write_column after two empty dumps once search is closed", () => {
    const prepared = prepareAnalyticsChatStep({
      steps: [
        step(["scan_attachments"]),
        emptyWriteStep(),
        emptyWriteStep(),
      ],
      canEdit: true,
    });
    expect(prepared?.activeTools).not.toContain("write_column");
    expect(prepared?.activeTools).toContain("manage_worksheet");
    expect(prepared?.activeTools).toContain("read_worksheet");
  });

  it("hides write_column after two empty dumps even if search is still open", () => {
    const prepared = prepareAnalyticsChatStep({
      steps: [emptyWriteStep(), emptyWriteStep()],
      canEdit: true,
    });
    expect(prepared?.activeTools).not.toContain("write_column");
    expect(prepared?.activeTools).toContain("search_documents");
    expect(prepared?.activeTools).toContain("manage_worksheet");
  });
});

function manageStep(): AnalyticsChatStep {
  return {
    toolCalls: [{ toolName: "manage_worksheet" }],
    toolResults: [
      {
        toolName: "manage_worksheet",
        output: {
          status: "ok",
          action: "add_sheet",
          sheetId: "data-6",
          sheetName: "Torque Data",
        },
      },
    ],
  };
}

function partialWriteStep(): AnalyticsChatStep {
  return {
    toolCalls: [{ toolName: "write_column" }],
    toolResults: [
      {
        toolName: "write_column",
        output: {
          status: "incomplete",
          rowsWritten: 0,
          blankedCount: 53,
          incomplete: true,
        },
      },
    ],
  };
}

describe("analyticsDumpReadinessDirective", () => {
  it("hides write_column after a cited-page grep until a page is read", () => {
    expect(
      analyticsDumpReadinessDirective([step(["search_documents"], 3)])
    ).toBe("read_first");
    const prepared = prepareAnalyticsChatStep({
      steps: [step(["search_documents"], 3), manageStep()],
      canEdit: true,
    });
    expect(prepared?.activeTools).not.toContain("write_column");
    expect(prepared?.activeTools).not.toContain("ask_user");
    expect(prepared?.activeTools).toContain("read_document_page");
    expect(prepared?.activeTools).toContain("scan_attachments");
  });

  it("does not treat document_outline as enough to dump", () => {
    expect(
      analyticsDumpReadinessDirective([
        step(["search_documents"], 3),
        step(["document_outline"]),
      ])
    ).toBe("read_first");
    const prepared = prepareAnalyticsChatStep({
      steps: [step(["search_documents"], 3), step(["document_outline"])],
      canEdit: true,
    });
    expect(prepared?.activeTools).not.toContain("write_column");
    expect(prepared?.activeTools).not.toContain("ask_user");
    expect(prepared?.activeTools).toContain("read_document_page");
  });

  it("unlocks write_column after a page read, scan, or extract", () => {
    expect(
      analyticsDumpReadinessDirective([
        step(["search_documents"], 3),
        step(["read_document_page"]),
      ])
    ).toBe("continue");
    expect(
      prepareAnalyticsChatStep({
        steps: [step(["search_documents"], 3), step(["read_document_page"])],
        canEdit: true,
      })?.activeTools
    ).toEqual(expect.arrayContaining(["write_column", "ask_user"]));
    expect(
      prepareAnalyticsChatStep({
        steps: [step(["search_documents"], 3), step(["scan_attachments"])],
        canEdit: true,
      })?.activeTools
    ).toContain("write_column");
    expect(
      prepareAnalyticsChatStep({
        steps: [step(["search_documents"], 3), step(["extract_numeric_series"])],
        canEdit: true,
      })?.activeTools
    ).toContain("write_column");
  });
});

describe("analyticsManageLoopDirective", () => {
  it("hides manage_worksheet after the first structure call this turn", () => {
    expect(analyticsManageLoopDirective([])).toBe("continue");
    expect(analyticsManageLoopDirective([manageStep()])).toBe("finish");
    const prepared = prepareAnalyticsChatStep({
      steps: [manageStep()],
      canEdit: true,
    });
    expect(prepared?.activeTools).not.toContain("manage_worksheet");
    expect(prepared?.activeTools).toContain("write_column");
    expect(prepared?.activeTools).toContain("search_documents");
  });
});

describe("analyticsPartialDumpDirective", () => {
  it("hides write_column after a partial extract until another page is read", () => {
    expect(analyticsPartialDumpDirective([partialWriteStep()])).toBe(
      "read_more"
    );
    const prepared = prepareAnalyticsChatStep({
      steps: [
        step(["search_documents"], 3),
        step(["read_document_page"]),
        partialWriteStep(),
      ],
      canEdit: true,
    });
    expect(prepared?.activeTools).not.toContain("write_column");
    expect(prepared?.activeTools).not.toContain("plot_xy_scatter");
    expect(prepared?.activeTools).toContain("read_document_page");
    expect(prepared?.activeTools).toContain("scan_attachments");
    expect(prepared?.toolChoice).toBe("required");
  });

  it("unlocks write_column after a later page read", () => {
    expect(
      analyticsPartialDumpDirective([
        partialWriteStep(),
        step(["read_document_page"]),
      ])
    ).toBe("continue");
    const prepared = prepareAnalyticsChatStep({
      steps: [
        step(["search_documents"], 3),
        step(["read_document_page"]),
        partialWriteStep(),
        step(["read_document_page"]),
      ],
      canEdit: true,
    });
    expect(prepared?.activeTools).toContain("write_column");
  });
});

function extractMorePagesStep(attachmentId?: string): AnalyticsChatStep {
  return {
    toolCalls: [{ toolName: "extract_numeric_series" }],
    toolResults: [
      {
        toolName: "extract_numeric_series",
        output: {
          status: "ok",
          attachmentId,
          pages: [1, 2, 3, 4, 5, 6],
          morePages: true,
          valueCount: 12,
        },
      },
    ],
  };
}

function extractDoneStep(attachmentId?: string): AnalyticsChatStep {
  return {
    toolCalls: [{ toolName: "extract_numeric_series" }],
    toolResults: [
      {
        toolName: "extract_numeric_series",
        output: {
          status: "ok",
          attachmentId,
          pages: [7, 8, 9],
          morePages: false,
          valueCount: 6,
        },
      },
    ],
  };
}

function truncatedScanStep(attachmentId?: string): AnalyticsChatStep {
  return {
    toolCalls: [{ toolName: "scan_attachments" }],
    toolResults: [
      {
        toolName: "scan_attachments",
        output: {
          status: "ok",
          truncated: true,
          readPageCount: 12,
          files: attachmentId ? [{ attachmentId }] : [],
        },
      },
    ],
  };
}

function completeWriteStep(): AnalyticsChatStep {
  return {
    toolCalls: [{ toolName: "write_column" }],
    toolResults: [
      {
        toolName: "write_column",
        output: {
          status: "written",
          rowsWritten: 29,
          incomplete: false,
          sheetId: "data-2",
        },
      },
    ],
  };
}

function pageReadOf(attachmentId: string): AnalyticsChatStep {
  return {
    toolCalls: [{ toolName: "read_document_page" }],
    toolResults: [
      {
        toolName: "read_document_page",
        output: { page: { attachmentId } },
      },
    ],
  };
}

describe("analyticsGatherDirective", () => {
  it("hides write_column while extract morePages is true", () => {
    expect(analyticsGatherDirective([extractMorePagesStep()])).toBe("gather");
    const prepared = prepareAnalyticsChatStep({
      steps: [step(["search_documents"], 3), extractMorePagesStep()],
      canEdit: true,
    });
    expect(prepared?.activeTools).not.toContain("write_column");
    expect(prepared?.activeTools).not.toContain("plot_xy_scatter");
    expect(prepared?.activeTools).toContain("extract_numeric_series");
    expect(prepared?.toolChoice).toBe("required");
  });

  it("unlocks write_column after a later extract with morePages false", () => {
    expect(
      analyticsGatherDirective([extractMorePagesStep(), extractDoneStep()])
    ).toBe("continue");
    const prepared = prepareAnalyticsChatStep({
      steps: [
        step(["search_documents"], 3),
        extractMorePagesStep(),
        extractDoneStep(),
      ],
      canEdit: true,
    });
    expect(prepared?.activeTools).toContain("write_column");
    expect(prepared?.toolChoice).toBeUndefined();
  });

  it("hides write_column while scan is truncated", () => {
    expect(analyticsGatherDirective([truncatedScanStep()])).toBe("gather");
    const prepared = prepareAnalyticsChatStep({
      steps: [truncatedScanStep()],
      canEdit: true,
    });
    expect(prepared?.activeTools).not.toContain("write_column");
    expect(prepared?.toolChoice).toBe("required");
  });

  it("keeps gathering file A when a later extract of file B is done", () => {
    expect(
      analyticsGatherDirective([
        extractMorePagesStep("att-a"),
        extractDoneStep("att-b"),
      ])
    ).toBe("gather");
    const prepared = prepareAnalyticsChatStep({
      steps: [
        step(["search_documents"], 3),
        extractMorePagesStep("att-a"),
        extractDoneStep("att-b"),
      ],
      canEdit: true,
    });
    expect(prepared?.activeTools).not.toContain("write_column");
    expect(prepared?.toolChoice).toBe("required");
  });

  it("does not let a bare page read clear a named extract that still has pages", () => {
    expect(
      analyticsGatherDirective([
        extractMorePagesStep("att-a"),
        step(["read_document_page"]),
      ])
    ).toBe("gather");
    expect(
      analyticsGatherDirective([
        extractMorePagesStep("att-a"),
        pageReadOf("att-a"),
      ])
    ).toBe("gather");
  });

  it("unlocks write after a page read finishes a truncated scan of that file", () => {
    expect(
      analyticsGatherDirective([
        truncatedScanStep("att-a"),
        pageReadOf("att-a"),
      ])
    ).toBe("continue");
    const prepared = prepareAnalyticsChatStep({
      steps: [
        step(["search_documents"], 3),
        truncatedScanStep("att-a"),
        pageReadOf("att-a"),
      ],
      canEdit: true,
    });
    expect(prepared?.activeTools).toContain("write_column");
  });

  it("keeps write_column available after a complete write so the next sheet can land", () => {
    const prepared = prepareAnalyticsChatStep({
      steps: [
        step(["search_documents"], 3),
        extractDoneStep("att-a"),
        completeWriteStep(),
      ],
      canEdit: true,
    });
    expect(prepared?.activeTools).toContain("write_column");
    expect(prepared?.toolChoice).toBeUndefined();
  });

  it("keeps extract_sheet available while a file is still gathering", () => {
    const prepared = prepareAnalyticsChatStep({
      steps: [step(["search_documents"], 3), extractMorePagesStep("att-a")],
      canEdit: true,
    });
    expect(prepared?.activeTools).toContain("extract_sheet");
    expect(prepared?.activeTools).not.toContain("write_column");
  });

  it("hides write_column again while gathering the next sheet's file", () => {
    expect(
      analyticsGatherDirective([
        extractDoneStep("att-a"),
        completeWriteStep(),
        extractMorePagesStep("att-b"),
      ])
    ).toBe("gather");
    const prepared = prepareAnalyticsChatStep({
      steps: [
        step(["search_documents"], 3),
        extractDoneStep("att-a"),
        completeWriteStep(),
        extractMorePagesStep("att-b"),
      ],
      canEdit: true,
    });
    expect(prepared?.activeTools).not.toContain("write_column");
    expect(prepared?.toolChoice).toBe("required");
  });
});
