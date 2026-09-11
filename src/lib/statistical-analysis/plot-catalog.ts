import {
  BOXPLOT,
  CAPABILITY_SIXPACK_NORMAL,
  HISTOGRAM,
  MEASUREMENT_SCATTER,
  ONE_WAY_ANOVA,
  XY_SCATTER,
  type AnalysisKind,
} from "./types";

/**
 * Worksheet Plot / Analyze data kinds. Attachment measurement scatter is
 * Analytics chat only (`plot_measurements`) — not a worksheet Plot item.
 */
export type WorksheetPlotKind = Exclude<
  AnalysisKind,
  typeof MEASUREMENT_SCATTER
>;

export type WorksheetPlotCatalogEntry = {
  kind: WorksheetPlotKind;
  label: string;
  menuTestId: string;
  /**
   * Fields live in Analyze data. Other kinds hand off to the dedicated
   * dialog so Analyze and Plot stay on one catalog without duplicating forms.
   */
  analyzeInline: boolean;
};

export const WORKSHEET_PLOT_CATALOG = [
  {
    kind: CAPABILITY_SIXPACK_NORMAL,
    label: "Normal Capability Sixpack",
    menuTestId: "stat-normal-sixpack",
    analyzeInline: true,
  },
  {
    kind: HISTOGRAM,
    label: "Histogram",
    menuTestId: "stat-histogram",
    analyzeInline: false,
  },
  {
    kind: ONE_WAY_ANOVA,
    label: "One-Way ANOVA",
    menuTestId: "stat-one-way-anova",
    analyzeInline: true,
  },
  {
    kind: BOXPLOT,
    label: "Boxplot",
    menuTestId: "stat-boxplot",
    analyzeInline: false,
  },
  {
    kind: XY_SCATTER,
    label: "Plot measurements",
    menuTestId: "stat-xy-scatter",
    analyzeInline: false,
  },
] as const satisfies readonly WorksheetPlotCatalogEntry[];

type CatalogKind = (typeof WORKSHEET_PLOT_CATALOG)[number]["kind"];
type MissingWorksheetKind = Exclude<WorksheetPlotKind, CatalogKind>;
type ExtraCatalogKind = Exclude<CatalogKind, WorksheetPlotKind>;
const _catalogCoversEveryWorksheetKind: MissingWorksheetKind extends never
  ? ExtraCatalogKind extends never
    ? true
    : ExtraCatalogKind
  : MissingWorksheetKind = true;
void _catalogCoversEveryWorksheetKind;

export function worksheetPlotEntry(
  kind: WorksheetPlotKind
): (typeof WORKSHEET_PLOT_CATALOG)[number] {
  const entry = WORKSHEET_PLOT_CATALOG.find((item) => item.kind === kind);
  if (!entry) {
    throw new Error(`Unknown worksheet plot kind: ${kind}`);
  }
  return entry;
}

export type AnalyzeInlinePlotKind = Extract<
  (typeof WORKSHEET_PLOT_CATALOG)[number],
  { analyzeInline: true }
>["kind"];

export function isAnalyzeInlinePlotKind(
  kind: WorksheetPlotKind
): kind is AnalyzeInlinePlotKind {
  return worksheetPlotEntry(kind).analyzeInline;
}

function englishList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Help copy for Analyze → Plot type; derived so it tracks the catalog. */
export function analyzePlotTypeHelpText(): string {
  const handoff = WORKSHEET_PLOT_CATALOG.filter(
    (item) => !item.analyzeInline
  ).map((item) => item.label);
  const base = "Same plots as Plot on the worksheet.";
  if (handoff.length === 0) return base;
  return `${base} ${englishList(handoff)} open their full dialogs.`;
}
