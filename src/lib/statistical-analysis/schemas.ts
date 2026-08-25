import { z } from "zod";
import {
  MAX_CELL_LENGTH,
  MAX_COLUMN_NAME_LENGTH,
  MAX_WORKSHEET_COLUMNS,
  MAX_WORKSHEET_ROWS,
} from "./types";

export const worksheetColumnSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(MAX_COLUMN_NAME_LENGTH),
  values: z.array(z.string().max(MAX_CELL_LENGTH)).max(MAX_WORKSHEET_ROWS),
});

export const worksheetDataSchema = z.object({
  columns: z.array(worksheetColumnSchema).min(1).max(MAX_WORKSHEET_COLUMNS),
});

export const capabilitySixpackInputSchema = z
  .object({
    columnId: z.string().trim().min(1),
    title: z.string().trim().max(120).optional(),
    lsl: z.number().finite().nullable(),
    usl: z.number().finite().nullable(),
    target: z.number().finite().nullable(),
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

export const patchAnalyticsBodySchema = z
  .object({
    worksheet: worksheetDataSchema.optional(),
    /** Ignored leftover from the old named-workspace autosave body. */
    name: z.string().optional(),
  })
  .refine((value) => value.worksheet !== undefined, {
    message: "Provide a worksheet to update.",
  });
