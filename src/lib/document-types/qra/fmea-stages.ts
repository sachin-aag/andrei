import { FMEA_COLUMN_SCHEMA, type FmeaColumnId } from "./matrix-columns";

export const FMEA_STAGES = [
  "identification",
  "scoring",
  "mitigation",
  "residual",
  "all",
] as const;

export type FmeaStage = (typeof FMEA_STAGES)[number];

export const DEFAULT_FMEA_STAGE: FmeaStage = "identification";

export const FMEA_STAGE_LABELS: Record<FmeaStage, string> = {
  identification: "Identification",
  scoring: "Scoring",
  mitigation: "Mitigation",
  residual: "Residual",
  all: "All columns",
};

/** Always shown in staged views so the row stays identifiable. */
export const FMEA_IDENTITY_COLUMN_IDS = [
  "riskId",
  "process",
  "failure",
] as const satisfies readonly FmeaColumnId[];

const STAGE_EXTRA_COLUMN_IDS: Record<
  Exclude<FmeaStage, "all">,
  readonly FmeaColumnId[]
> = {
  identification: ["cause", "effect"],
  scoring: [
    "severity",
    "controls",
    "probability",
    "detectionMeasures",
    "detectability",
    "rpn",
    "acceptable",
  ],
  mitigation: ["mitigation", "responsibility"],
  residual: [
    "revisedSeverity",
    "revisedProbability",
    "revisedDetectability",
    "finalRpn",
    "finalAcceptable",
  ],
};

export function isFmeaStage(value: string): value is FmeaStage {
  return (FMEA_STAGES as readonly string[]).includes(value);
}

export function fmeaVisibleColumnIds(stage: FmeaStage): readonly FmeaColumnId[] {
  if (stage === "all") {
    return FMEA_COLUMN_SCHEMA.map((col) => col.id);
  }
  return [...FMEA_IDENTITY_COLUMN_IDS, ...STAGE_EXTRA_COLUMN_IDS[stage]];
}

/** 0-based indexes into `FMEA_COLUMN_SCHEMA`. */
export function fmeaHiddenColumnIndexes(stage: FmeaStage): number[] {
  if (stage === "all") return [];
  const visible = new Set(fmeaVisibleColumnIds(stage));
  return FMEA_COLUMN_SCHEMA.flatMap((col, index) =>
    visible.has(col.id) ? [] : [index]
  );
}

/** 1-based `nth-child` indexes — keep `globals.css` `.fmea-grid` rules in sync. */
export function fmeaHiddenNthChildren(stage: FmeaStage): number[] {
  return fmeaHiddenColumnIndexes(stage).map((index) => index + 1);
}
