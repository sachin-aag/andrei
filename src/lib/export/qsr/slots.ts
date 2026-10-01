import type { QsrSectionKey } from "@/lib/document-types/qsr/sections";

/**
 * Template ↔ exporter contract for the QSR Word form. The build script wraps
 * each editable body in `[[QSR:key]]` … `[[/QSR:key]]` marker paragraphs with
 * the original form's formatting as prototypes in between; the exporter
 * replaces that whole span with the report content.
 */
export const qsrSlotStart = (key: QsrSectionKey) => `[[QSR:${key}]]`;
export const qsrSlotEnd = (key: QsrSectionKey) => `[[/QSR:${key}]]`;

/** First-cell text of the prototype body row inside a slot table. */
export const QSR_ROW_MARKER = "[[row]]";
/** First-cell text of the prototype full-width group row (e.g. "GLR-1301"). */
export const QSR_BANNER_MARKER = "[[banner]]";
/** Volumetric slot: prototype equipment sub-heading and trailing spacer. */
export const QSR_HEADING_MARKER = "[[heading]]";
export const QSR_SPACER_MARKER = "[[spacer]]";

/**
 * Merge rules that rebuild the form's merged cells from a plain editor grid
 * (chat table tools only edit simple grids).
 */
export type QsrTableMergeRules = {
  /**
   * A row whose `blankColumn` is empty but `filledColumn` is not continues
   * the row above: each blank cell in `columns` merges vertically upward.
   */
  continueRow?: { blankColumn: number; filledColumn: number; columns: readonly number[] };
  /** When this column is blank it merges into the next column (gridSpan 2). */
  mergeBlankIntoNext?: number;
  /** A row with only a bold first cell becomes a full-width group row. */
  boldFirstCellBanner?: boolean;
};

export type QsrSlot =
  | { key: QsrSectionKey; kind: "narrative" }
  | { key: QsrSectionKey; kind: "volumetric" }
  | {
      key: QsrSectionKey;
      kind: "table";
      merge?: QsrTableMergeRules;
      /** Bookmark closing an Index page range (e.g. "10-22"). */
      endBookmark?: string;
    };

export const QSR_SLOTS: readonly QsrSlot[] = [
  { key: "qsr_objective", kind: "narrative" },
  { key: "qsr_scope", kind: "narrative" },
  { key: "qsr_references", kind: "table" },
  { key: "qsr_acronyms", kind: "table" },
  { key: "qsr_overview", kind: "narrative" },
  { key: "qsr_background", kind: "narrative" },
  {
    key: "qsr_qualification_documents",
    kind: "table",
    merge: {
      continueRow: { blankColumn: 0, filledColumn: 1, columns: [0, 2, 5] },
      boldFirstCellBanner: true,
    },
  },
  { key: "qsr_sops", kind: "table" },
  {
    key: "qsr_rtm_process",
    kind: "table",
    merge: { boldFirstCellBanner: true },
    endBookmark: "_QsrEnd_process",
  },
  {
    key: "qsr_rtm_control",
    kind: "table",
    merge: { boldFirstCellBanner: true },
    endBookmark: "_QsrEnd_control",
  },
  { key: "qsr_rtm_gmp", kind: "table", merge: { boldFirstCellBanner: true } },
  {
    key: "qsr_rtm_safety",
    kind: "table",
    merge: { boldFirstCellBanner: true },
    endBookmark: "_QsrEnd_safety",
  },
  { key: "qsr_rtm_csv", kind: "table", merge: { boldFirstCellBanner: true } },
  {
    key: "qsr_rtm_maintenance",
    kind: "table",
    merge: { boldFirstCellBanner: true },
    endBookmark: "_QsrEnd_maintenance",
  },
  { key: "qsr_volumetric_details", kind: "volumetric" },
  {
    key: "qsr_operating_range",
    kind: "table",
    merge: {
      mergeBlankIntoNext: 2,
      continueRow: { blankColumn: 0, filledColumn: 2, columns: [0, 1] },
    },
  },
  { key: "qsr_other_details", kind: "narrative" },
  { key: "qsr_conclusion", kind: "narrative" },
];

export type QsrIndexEntry = {
  number: string;
  start: string;
  /** Present when the form prints a page range. */
  end?: string;
};

/** Index table rows 1…19, in order, with the bookmarks their page cells cite. */
export const QSR_INDEX_ENTRIES: readonly QsrIndexEntry[] = [
  { number: "1", start: "_QsrIdx_1" },
  { number: "1.1", start: "_QsrIdx_1_1" },
  { number: "1.2", start: "_QsrIdx_1_2" },
  { number: "1.3", start: "_QsrIdx_1_3" },
  { number: "1.4", start: "_QsrIdx_1_4" },
  { number: "2", start: "_QsrIdx_2" },
  { number: "2.1", start: "_QsrIdx_2_1" },
  { number: "2.2", start: "_QsrIdx_2_2" },
  { number: "3", start: "_QsrIdx_3" },
  { number: "4", start: "_QsrIdx_4" },
  { number: "5", start: "_QsrIdx_5", end: "_QsrEnd_maintenance" },
  { number: "5.1", start: "_QsrIdx_5_1", end: "_QsrEnd_process" },
  { number: "5.2", start: "_QsrIdx_5_2", end: "_QsrEnd_control" },
  { number: "5.3", start: "_QsrIdx_5_3" },
  { number: "5.4", start: "_QsrIdx_5_4", end: "_QsrEnd_safety" },
  { number: "5.5", start: "_QsrIdx_5_5" },
  { number: "5.6", start: "_QsrIdx_5_6", end: "_QsrEnd_maintenance" },
  { number: "6", start: "_QsrIdx_6" },
  { number: "7", start: "_QsrIdx_7" },
];
