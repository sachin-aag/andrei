import { z } from "zod";
import { CHART_MARKS } from "@/lib/charts/chart-marks";
import {
  MAX_CELL_LENGTH,
  MAX_COLUMN_NAME_LENGTH,
  MAX_WORKSHEET_COLUMNS,
  MAX_WORKSHEET_ROWS,
  MEASUREMENT_SCATTER,
  ONE_WAY_ANOVA,
  XY_SCATTER,
  BOXPLOT,
  MAX_BOXPLOT_CATEGORIES,
} from "./types";

const worksheetColumnCitationSchema = z.object({
  attachmentId: z.string().trim().min(1).max(128),
  page: z.number().int().min(1).max(10_000),
});

export const worksheetColumnSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(MAX_COLUMN_NAME_LENGTH),
  values: z.array(z.string().max(MAX_CELL_LENGTH)).max(MAX_WORKSHEET_ROWS),
  citations: z.array(worksheetColumnCitationSchema).max(24).optional(),
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

function refineOptionalSpecPair(
  value: { lsl?: number | null; usl?: number | null },
  ctx: z.RefinementCtx
): void {
  if (value.lsl != null && value.usl != null && !(value.lsl < value.usl)) {
    ctx.addIssue({
      code: "custom",
      message: "Lower spec must be less than upper spec.",
      path: ["lsl"],
    });
  }
}

const measurementScatterFields = {
  query: z.string().trim().min(1).max(200),
  title: z.string().trim().max(120).optional(),
  xLabel: z.string().trim().max(60).optional(),
  yLabel: z.string().trim().max(80).optional(),
  layout: measurementScatterLayoutInputSchema.optional(),
  lsl: z.number().finite().nullable().optional(),
  usl: z.number().finite().nullable().optional(),
} as const;

/** Chat tool body — same fields as create, without the persisted `kind`. */
export const measurementScatterToolInputSchema = z
  .object(measurementScatterFields)
  .superRefine(refineOptionalSpecPair);

export const measurementScatterInputSchema = z
  .object({
    kind: z.literal(MEASUREMENT_SCATTER),
    ...measurementScatterFields,
  })
  .superRefine(refineOptionalSpecPair);

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

function refineDistinctXyColumns(
  value: {
    xColumnId?: string | null;
    yColumnId?: string;
    legendColumnId?: string | null;
  },
  ctx: z.RefinementCtx
): void {
  if (
    value.yColumnId &&
    value.xColumnId &&
    value.xColumnId === value.yColumnId
  ) {
    ctx.addIssue({
      code: "custom",
      message: "X, Y, and legend must be different columns.",
      path: ["xColumnId"],
    });
  }
  if (
    value.yColumnId &&
    value.legendColumnId &&
    value.legendColumnId === value.yColumnId
  ) {
    ctx.addIssue({
      code: "custom",
      message: "X, Y, and legend must be different columns.",
      path: ["legendColumnId"],
    });
  }
  if (
    value.legendColumnId &&
    value.xColumnId &&
    value.legendColumnId === value.xColumnId
  ) {
    ctx.addIssue({
      code: "custom",
      message: "X, Y, and legend must be different columns.",
      path: ["legendColumnId"],
    });
  }
}

const optionalColumnIdSchema = z.preprocess(
  (value) => {
    if (value == null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().min(1).nullable()
);

const xyScatterAxisFields = {
  xColumnId: optionalColumnIdSchema.optional(),
  legendColumnId: optionalColumnIdSchema.optional(),
  title: z.string().trim().max(120).optional(),
  ...anovaRowFields,
} as const;

const xyScatterColumnFields = {
  yColumnId: z.string().trim().min(1),
  ...xyScatterAxisFields,
} as const;

const xyScatterUiFields = {
  ...xyScatterColumnFields,
  mark: z.enum(CHART_MARKS).optional(),
  showSpecLimits: z.boolean().optional(),
  xMin: z.number().finite().nullable().optional(),
  xMax: z.number().finite().nullable().optional(),
  yMin: z.number().finite().nullable().optional(),
  yMax: z.number().finite().nullable().optional(),
  xAxisLabel: z.string().trim().max(60).nullable().optional(),
  yAxisLabel: z.string().trim().max(80).nullable().optional(),
} as const;

function refineAxisBounds(
  value: {
    xMin?: number | null;
    xMax?: number | null;
    yMin?: number | null;
    yMax?: number | null;
  },
  ctx: z.RefinementCtx
): void {
  if (value.xMin != null && value.xMax != null && !(value.xMin < value.xMax)) {
    ctx.addIssue({
      code: "custom",
      message: "Min X must be less than max X.",
      path: ["xMax"],
    });
  }
  if (value.yMin != null && value.yMax != null && !(value.yMin < value.yMax)) {
    ctx.addIssue({
      code: "custom",
      message: "Min Y must be less than max Y.",
      path: ["yMax"],
    });
  }
}

function refineXyScatterChatBody(
  value: {
    analysisId?: string;
    yColumnId?: string;
    xColumnId?: string | null;
    legendColumnId?: string | null;
    xMin?: number | null;
    xMax?: number | null;
    yMin?: number | null;
    yMax?: number | null;
  },
  ctx: z.RefinementCtx
): void {
  if (!value.analysisId && !value.yColumnId) {
    ctx.addIssue({
      code: "custom",
      message: "yColumnId is required when creating a new plot.",
      path: ["yColumnId"],
    });
  }
  refineDistinctXyColumns(value, ctx);
  refineAxisBounds(value, ctx);
}

/** Chat tool body — create (yColumnId required) or update (analysisId + changed fields). */
export const xyScatterBodySchema = z
  .object({
    analysisId: z.string().trim().min(1).max(128).optional(),
    yColumnId: z.string().trim().min(1).optional(),
    ...xyScatterAxisFields,
    mark: z.enum(CHART_MARKS).optional(),
    showSpecLimits: z.boolean().optional(),
    xMin: z.number().finite().nullable().optional(),
    xMax: z.number().finite().nullable().optional(),
    yMin: z.number().finite().nullable().optional(),
    yMax: z.number().finite().nullable().optional(),
    xAxisLabel: z.string().trim().max(60).nullable().optional(),
    yAxisLabel: z.string().trim().max(80).nullable().optional(),
  })
  .superRefine(refineXyScatterChatBody);

export const xyScatterInputSchema = z
  .object({
    kind: z.literal(XY_SCATTER),
    ...xyScatterUiFields,
  })
  .superRefine((value, ctx) => {
    refineDistinctXyColumns(value, ctx);
    refineAxisBounds(value, ctx);
  });

function refineBoxplotColumns(
  value: { yColumnId?: string; categoryColumnIds?: string[] },
  ctx: z.RefinementCtx
): void {
  const ids = value.categoryColumnIds ?? [];
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    if (value.yColumnId && id === value.yColumnId) {
      ctx.addIssue({
        code: "custom",
        message: "Y and category columns must be different.",
        path: ["categoryColumnIds", i],
      });
    }
    if (seen.has(id)) {
      ctx.addIssue({
        code: "custom",
        message: "Category columns must be unique.",
        path: ["categoryColumnIds", i],
      });
    }
    seen.add(id);
  }
}

const boxplotRowFields = anovaRowFields;

const boxplotCategoryIdsSchema = z
  .array(z.string().trim().min(1))
  .max(MAX_BOXPLOT_CATEGORIES)
  .optional();

function refineBoxplotChatBody(
  value: {
    analysisId?: string;
    yColumnId?: string;
    categoryColumnIds?: string[];
  },
  ctx: z.RefinementCtx
): void {
  if (!value.analysisId && !value.yColumnId) {
    ctx.addIssue({
      code: "custom",
      message: "yColumnId is required when creating a new boxplot.",
      path: ["yColumnId"],
    });
  }
  refineBoxplotColumns(value, ctx);
}

/** Chat tool body — create (yColumnId required) or update (analysisId + changed fields). */
export const boxplotBodySchema = z
  .object({
    analysisId: z.string().trim().min(1).max(128).optional(),
    yColumnId: z.string().trim().min(1).optional(),
    categoryColumnIds: boxplotCategoryIdsSchema,
    title: z.string().trim().max(120).optional(),
    xAxisLabel: z.string().trim().max(60).nullable().optional(),
    yAxisLabel: z.string().trim().max(80).nullable().optional(),
    ...boxplotRowFields,
  })
  .superRefine(refineBoxplotChatBody);

export const boxplotInputSchema = z
  .object({
    kind: z.literal(BOXPLOT),
    yColumnId: z.string().trim().min(1),
    categoryColumnIds: boxplotCategoryIdsSchema,
    title: z.string().trim().max(120).optional(),
    xAxisLabel: z.string().trim().max(60).nullable().optional(),
    yAxisLabel: z.string().trim().max(80).nullable().optional(),
    ...boxplotRowFields,
  })
  .superRefine(refineBoxplotColumns);

/** Edit/update from the Boxplot dialog or chat (omitted fields keep the saved config). */
export const boxplotUpdateSchema = z
  .object({
    yColumnId: z.string().trim().min(1).optional(),
    categoryColumnIds: boxplotCategoryIdsSchema,
    title: z.string().trim().max(120).optional(),
    xAxisLabel: z.string().trim().max(60).nullable().optional(),
    yAxisLabel: z.string().trim().max(80).nullable().optional(),
    ...boxplotRowFields,
  })
  .superRefine(refineBoxplotColumns);

/** Edit/update from the Plot measurements dialog or chat (omitted fields keep the saved config). */
export const xyScatterUpdateSchema = z
  .object({
    yColumnId: z.string().trim().min(1).optional(),
    ...xyScatterAxisFields,
    mark: z.enum(CHART_MARKS).optional(),
    showSpecLimits: z.boolean().optional(),
    xMin: z.number().finite().nullable().optional(),
    xMax: z.number().finite().nullable().optional(),
    yMin: z.number().finite().nullable().optional(),
    yMax: z.number().finite().nullable().optional(),
    xAxisLabel: z.string().trim().max(60).nullable().optional(),
    yAxisLabel: z.string().trim().max(80).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    refineDistinctXyColumns(value, ctx);
    refineAxisBounds(value, ctx);
  });

export const patchAnalyticsBodySchema = z
  .object({
    worksheet: worksheetDataSchema.optional(),
    /** Last-seen `ReportAnalyticsView.version`. Omit only for legacy beacons. */
    version: z.number().int().positive().optional(),
    /** Ignored leftover from the old named-workspace autosave body. */
    name: z.string().optional(),
  })
  .refine((value) => value.worksheet !== undefined, {
    message: "Provide a worksheet to update.",
  });
