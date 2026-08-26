import { z } from "zod";
import {
  MAX_CELL_LENGTH,
  MAX_COLUMN_NAME_LENGTH,
  MAX_WORKSHEET_COLUMNS,
  MAX_WORKSHEET_ROWS,
  MEASUREMENT_SCATTER,
  ONE_WAY_ANOVA,
} from "./types";

export const worksheetColumnSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(MAX_COLUMN_NAME_LENGTH),
  values: z.array(z.string().max(MAX_CELL_LENGTH)).max(MAX_WORKSHEET_ROWS),
});

export const worksheetSheetSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(40),
  columns: z.array(worksheetColumnSchema).min(1).max(MAX_WORKSHEET_COLUMNS),
});

export const worksheetSpecRowSchema = z.object({
  columnName: z.string().trim().min(1).max(MAX_COLUMN_NAME_LENGTH),
  lsl: z.string().max(MAX_CELL_LENGTH).default(""),
  usl: z.string().max(MAX_CELL_LENGTH).default(""),
  target: z.string().max(MAX_CELL_LENGTH).default(""),
});

export const worksheetDataSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    const columns = Array.isArray(record.columns) ? record.columns : [];
    const sheets = Array.isArray(record.sheets) ? record.sheets : undefined;
    const specs = Array.isArray(record.specs)
      ? record.specs.filter((item) => {
          if (!item || typeof item !== "object") return false;
          const name = (item as { columnName?: unknown }).columnName;
          return typeof name === "string" && name.trim().length > 0;
        })
      : [];
    const activeSheetId =
      typeof record.activeSheetId === "string" ? record.activeSheetId : undefined;
    return {
      columns,
      sheets:
        sheets && sheets.length > 0
          ? sheets
          : [{ id: "data-1", name: "Data", columns }],
      specs,
      activeSheetId: activeSheetId ?? "data-1",
    };
  },
  z.object({
    columns: z.array(worksheetColumnSchema).min(1).max(MAX_WORKSHEET_COLUMNS),
    sheets: z.array(worksheetSheetSchema).min(1).max(12),
    specs: z.array(worksheetSpecRowSchema).max(200),
    activeSheetId: z.string().trim().min(1).max(64),
  })
);

export const capabilitySixpackInputSchema = z
  .object({
    columnId: z.string().trim().min(1),
    title: z.string().trim().max(120).optional(),
    lsl: z.number().finite().nullable(),
    usl: z.number().finite().nullable(),
    target: z.number().finite().nullable(),
    rowStart: z
      .number()
      .int()
      .min(1)
      .max(MAX_WORKSHEET_ROWS)
      .nullable()
      .optional(),
    rowEnd: z
      .number()
      .int()
      .min(1)
      .max(MAX_WORKSHEET_ROWS)
      .nullable()
      .optional(),
    rows: z
      .array(z.number().int().min(1).max(MAX_WORKSHEET_ROWS))
      .max(MAX_WORKSHEET_ROWS)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.lsl == null && value.usl == null) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a lower spec, an upper spec, or both.",
        path: ["lsl"],
      });
    }
    if (value.lsl != null && value.usl != null && !(value.lsl < value.usl)) {
      ctx.addIssue({
        code: "custom",
        message: "Lower spec must be less than upper spec.",
        path: ["lsl"],
      });
    }
  });

export const measurementScatterLayoutInputSchema = z.object({
  mode: z.enum(["combined", "per-series"]).optional(),
  seriesBy: z.enum(["unit", "none"]).optional(),
  xAxis: z.enum(["sequential", "replicate"]).optional(),
  yMax: z.number().finite().optional(),
});

export const measurementScatterInputSchema = z.object({
  kind: z.literal(MEASUREMENT_SCATTER),
  query: z.string().trim().min(1).max(200),
  title: z.string().trim().max(120).optional(),
  xLabel: z.string().trim().max(60).optional(),
  yLabel: z.string().trim().max(80).optional(),
  layout: measurementScatterLayoutInputSchema.optional(),
});

const anovaRowFields = {
  rowStart: z
    .number()
    .int()
    .min(1)
    .max(MAX_WORKSHEET_ROWS)
    .nullable()
    .optional(),
  rowEnd: z
    .number()
    .int()
    .min(1)
    .max(MAX_WORKSHEET_ROWS)
    .nullable()
    .optional(),
  rows: z
    .array(z.number().int().min(1).max(MAX_WORKSHEET_ROWS))
    .max(MAX_WORKSHEET_ROWS)
    .optional(),
} as const;

function refineDistinctAnovaColumns(
  value: { responseColumnId: string; factorColumnId: string },
  ctx: z.RefinementCtx
): void {
  if (value.responseColumnId === value.factorColumnId) {
    ctx.addIssue({
      code: "custom",
      message: "Response and factor must be different columns.",
      path: ["factorColumnId"],
    });
  }
}

export const oneWayAnovaBodySchema = z
  .object({
    responseColumnId: z.string().trim().min(1),
    factorColumnId: z.string().trim().min(1),
    title: z.string().trim().max(120).optional(),
    alpha: z.number().gt(0).lt(1).optional(),
    ...anovaRowFields,
  })
  .superRefine(refineDistinctAnovaColumns);

export const oneWayAnovaInputSchema = z
  .object({
    kind: z.literal(ONE_WAY_ANOVA),
    responseColumnId: z.string().trim().min(1),
    factorColumnId: z.string().trim().min(1),
    title: z.string().trim().max(120).optional(),
    alpha: z.number().gt(0).lt(1).optional(),
    ...anovaRowFields,
  })
  .superRefine(refineDistinctAnovaColumns);

export const patchAnalyticsBodySchema = z
  .object({
    worksheet: worksheetDataSchema.optional(),
    /** Ignored leftover from the old named-workspace autosave body. */
    name: z.string().optional(),
  })
  .refine((value) => value.worksheet !== undefined, {
    message: "Provide a worksheet to update.",
  });
