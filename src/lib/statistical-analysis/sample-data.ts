import type { WorksheetData } from "./types";
import { replaceColumnValues, upsertSpecRow } from "./worksheet";

/** Demo assay % observations for the capability sixpack walkthrough. */
export const SAMPLE_ASSAY_COLUMN_NAME = "Assay";
export const SAMPLE_LOT_COLUMN_NAME = "Lot";
export const SAMPLE_LOT_LEVELS = ["A", "B", "C"] as const;

export const SAMPLE_ASSAY_VALUES = [
  101.84, 103.12, 100.47, 104.55, 102.31, 99.88, 105.02, 101.19, 103.67,
  102.08, 100.93, 104.11, 101.56, 103.29, 102.74, 99.41, 105.38, 101.02,
  103.91, 102.46, 100.22, 104.73, 101.78, 103.05, 102.19, 100.61, 104.28,
  101.33, 103.48, 102.87, 99.97, 105.16, 101.41, 103.74, 102.52, 100.38,
  104.49, 101.67, 103.21, 102.13, 100.79, 104.02, 101.09, 103.58, 102.66,
  99.64, 105.21, 101.25, 103.39, 102.33,
] as const;

export function sampleAssayWorksheetColumn(): {
  name: string;
  values: string[];
} {
  return {
    name: SAMPLE_ASSAY_COLUMN_NAME,
    values: SAMPLE_ASSAY_VALUES.map((value) => value.toFixed(2)),
  };
}

export function sampleLotValues(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => SAMPLE_LOT_LEVELS[index % SAMPLE_LOT_LEVELS.length]!
  );
}

export function applySampleAssay(
  data: WorksheetData,
  colIndex = 0
): WorksheetData {
  const sample = sampleAssayWorksheetColumn();
  let next = upsertSpecRow(
    replaceColumnValues(data, colIndex, sample.values, sample.name),
    {
      columnName: sample.name,
      lsl: "90",
      usl: "110",
      target: "100",
    }
  );
  const lotIndex =
    colIndex + 1 < next.columns.length ? colIndex + 1 : colIndex - 1;
  if (lotIndex >= 0 && lotIndex !== colIndex && next.columns[lotIndex]) {
    next = replaceColumnValues(
      next,
      lotIndex,
      sampleLotValues(sample.values.length),
      SAMPLE_LOT_COLUMN_NAME
    );
  }
  return next;
}
