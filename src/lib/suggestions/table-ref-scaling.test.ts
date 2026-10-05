import type { JSONContent } from "@tiptap/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RICH_FIELD_PATHS } from "@/lib/ai/suggest-target-fields";
import { EMPTY_ELR_CONTENT } from "@/lib/document-types/elr/sections";
import {
  documentContentsFromReportState,
  liveTableRefNumbers,
  orderedSectionContents,
  type TableNumberComment,
} from "@/lib/suggestions/document-table-number";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import {
  applyTableOperation,
  filledTableNumberInDocument,
} from "@/lib/suggestions/table-operation";
import {
  listInsertableTableRefs,
  tableRefNumberMap,
} from "@/lib/suggestions/table-ref";

// Count the two whole-field walks so the cost stays tied to what changed,
// not to the size of the report. Wall-clock budgets flake on a busy runner.
vi.mock("@/lib/suggestions/rich-field-value", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/suggestions/rich-field-value")>();
  return { ...actual, getRichFieldValue: vi.fn(actual.getRichFieldValue) };
});
vi.mock("@/lib/suggestions/table-operation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/suggestions/table-operation")>();
  return { ...actual, applyTableOperation: vi.fn(actual.applyTableOperation) };
});

const DOCUMENT_TYPE = "equipment_lifecycle_report" as const;

function table(dataRows: string[]): JSONContent {
  const row = (type: string, text: string): JSONContent => ({
    type: "tableRow",
    content: [0, 1].map(() => ({
      type,
      content: [
        { type: "paragraph", content: text ? [{ type: "text", text }] : [] },
      ],
    })),
  });
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          row("tableHeader", "Header"),
          ...dataRows.map((text) => row("tableCell", text)),
        ],
      },
    ],
  };
}

/** Every ELR section, each `table` field alternately filled and empty. */
function elrSections(): Record<string, unknown> {
  const sections: Record<string, unknown> = {};
  Object.entries(EMPTY_ELR_CONTENT).forEach(([key, empty], index) => {
    const content = empty as Record<string, unknown>;
    sections[key] =
      content.table === undefined
        ? content
        : { ...content, table: table(index % 2 === 0 ? ["filled"] : [""]) };
  });
  return sections;
}

function insertRowsComment(id: string, section: string): TableNumberComment {
  return {
    id,
    section: section as TableNumberComment["section"],
    contentPath: "table",
    status: "open",
    kind: "ai_fix",
    createdAt: new Date(1_700_000_000_000 + Number(id)).toISOString(),
    content: JSON.stringify({
      criterionKey: "k",
      targetField: "table",
      tableOperation: {
        kind: "insert_rows",
        rows: [{ cells: [`row ${id}`, "value"] }],
      },
    }),
  };
}

function richFieldCount(sections: Record<string, unknown>): number {
  return Object.keys(sections).reduce(
    (sum, key) => sum + (RICH_FIELD_PATHS[key]?.length ?? 0),
    0
  );
}

describe("table reference numbering cost", () => {
  beforeEach(() => {
    vi.mocked(getRichFieldValue).mockClear();
    vi.mocked(applyTableOperation).mockClear();
  });

  it("numbers every table the same as the per-table lookup", () => {
    const contents = orderedSectionContents({
      documentType: DOCUMENT_TYPE,
      sections: elrSections(),
    });
    const map = tableRefNumberMap(contents);
    expect(map.size).toBeGreaterThan(10);
    for (const key of map.keys()) {
      const [section, rest] = key.split("\0") as [string, string];
      const [targetField, tableIndex] = rest.split("#") as [string, string];
      expect(map.get(key)).toBe(
        filledTableNumberInDocument({
          contents,
          target: { section, targetField, tableIndex: Number(tableIndex) },
        })
      );
    }
    const insertable = listInsertableTableRefs(contents);
    expect(insertable.map((item) => item.n)).toEqual(
      insertable.map((_, index) => index + 1)
    );
  });

  it("reads each rich field once, then only the section that changed", () => {
    const sections = elrSections();
    const first = liveTableRefNumbers({
      documentType: DOCUMENT_TYPE,
      sections,
      comments: [],
    });
    expect(vi.mocked(getRichFieldValue).mock.calls.length).toBeLessThanOrEqual(
      richFieldCount(sections)
    );

    vi.mocked(getRichFieldValue).mockClear();
    const edited = {
      ...sections,
      elr_objective: {
        ...(sections.elr_objective as Record<string, unknown>),
      },
    };
    const second = liveTableRefNumbers({
      documentType: DOCUMENT_TYPE,
      sections: edited,
      comments: [],
    });
    expect(vi.mocked(getRichFieldValue).mock.calls.length).toBeLessThanOrEqual(
      RICH_FIELD_PATHS.elr_objective?.length ?? 0
    );
    // Same numbering → same objects, so consumers do not re-render.
    expect(second.map).toBe(first.map);
    expect(second.insertable).toBe(first.insertable);
  });

  it("re-applies pending table suggestions only for the section that changed", () => {
    const sections = elrSections();
    const comments = Array.from({ length: 12 }, (_, i) =>
      insertRowsComment(String(i), "elr_access_control")
    );
    documentContentsFromReportState({
      documentType: DOCUMENT_TYPE,
      sections,
      comments,
    });
    expect(vi.mocked(applyTableOperation)).toHaveBeenCalledTimes(12);

    vi.mocked(applyTableOperation).mockClear();
    documentContentsFromReportState({
      documentType: DOCUMENT_TYPE,
      sections: {
        ...sections,
        elr_objective: {
          ...(sections.elr_objective as Record<string, unknown>),
        },
      },
      comments: [...comments],
    });
    expect(vi.mocked(applyTableOperation)).not.toHaveBeenCalled();

    documentContentsFromReportState({
      documentType: DOCUMENT_TYPE,
      sections,
      comments: comments.slice(1),
    });
    expect(vi.mocked(applyTableOperation)).toHaveBeenCalledTimes(11);
  });

  it("does not hand back live section objects that pending suggestions touched", () => {
    const sections = elrSections();
    const before = JSON.stringify(sections.elr_access_control);
    const contents = documentContentsFromReportState({
      documentType: DOCUMENT_TYPE,
      sections,
      comments: [insertRowsComment("1", "elr_access_control")],
    });
    const overlaid = contents.find((row) => row.section === "elr_access_control");
    expect(overlaid?.content).not.toBe(sections.elr_access_control);
    expect(JSON.stringify(overlaid?.content)).not.toBe(before);
    expect(JSON.stringify(sections.elr_access_control)).toBe(before);
  });
});
