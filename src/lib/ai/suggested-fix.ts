import { z } from "zod";

/**
 * Per-criterion fix shape emitted by the AI reviewer. Three variants:
 *
 *   - `none`   → criterion is met; nothing to apply.
 *   - `patch`  → narrative-targeted fix; `anchorText` is replaced inline by
 *                `replacementText` via Tiptap suggestion marks.
 *   - `fields` → structured-form fix; an array of set/append ops applied to
 *                nested fields on the section content (used by Analyze and the
 *                non-narrative parts of Improve / Control).
 *
 * Path syntax: dot for nested objects, `[N]` for array indices, e.g.
 *   `sixM.man`, `correctiveActions[0].dueDate`, `impactAssessment.system`.
 *   For `op:"append"`, `path` is the array (no index), e.g. `correctiveActions`.
 */

const setFieldOpSchema = z.object({
  op: z.literal("set"),
  path: z.string().min(1).max(200),
  value: z.string().max(4000),
});

const appendFieldOpSchema = z.object({
  op: z.literal("append"),
  path: z.string().min(1).max(200),
  /** Plain record of string fields. Client adds an `id` on apply for arrays
   *  that require one (e.g. `correctiveActions`). */
  value: z.record(z.string(), z.string().max(2000)),
});

const rawFieldOpSchema = z.discriminatedUnion("op", [
  setFieldOpSchema,
  appendFieldOpSchema,
]);

export const fieldOpSchema = z.preprocess((raw) => {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}, rawFieldOpSchema);

const noneFixSchema = z.object({
  kind: z.literal("none"),
});

const patchFixSchema = z.object({
  kind: z.literal("patch"),
  anchorText: z.string().max(800),
  replacementText: z.string().max(2000),
});

const fieldsFixSchema = z.object({
  kind: z.literal("fields"),
  ops: z.array(fieldOpSchema).min(1).max(20),
});

export const suggestedFixSchema = z.discriminatedUnion("kind", [
  noneFixSchema,
  patchFixSchema,
  fieldsFixSchema,
]);

export const legacySuggestedFixSchema = z.object({
  anchorText: z.string().max(800),
  replacementText: z.string().max(2000),
});

// Keep the provider-facing schema shallow. Gemini's native responseSchema
// support can struggle with nested unions/preprocess schemas, but leaving this
// as z.unknown() gives the model no length guidance and it can copy entire
// section narratives into anchorText until the JSON is truncated.
export const modelSuggestedFixSchema = z.object({
  kind: z.enum(["none", "patch", "fields"]).optional(),
  anchorText: z.string().max(600).optional(),
  replacementText: z.string().max(1600).optional(),
  ops: z.array(z.unknown()).max(12).optional(),
});

export type SetFieldOp = z.infer<typeof setFieldOpSchema>;
export type AppendFieldOp = z.infer<typeof appendFieldOpSchema>;
export type FieldOp = z.infer<typeof fieldOpSchema>;
export type SuggestedFix = z.infer<typeof suggestedFixSchema>;
export type NoneFix = Extract<SuggestedFix, { kind: "none" }>;
export type PatchFix = Extract<SuggestedFix, { kind: "patch" }>;
export type FieldsFix = Extract<SuggestedFix, { kind: "fields" }>;

export const EMPTY_SUGGESTED_FIX: SuggestedFix = { kind: "none" };

/**
 * Defensive parse for any value coming off the wire or out of the DB. Maps
 * legacy `{anchorText, replacementText}` rows (no `kind` discriminator) to the
 * new `kind:"patch"` shape so existing evaluations keep working without a
 * backfill. Anything unrecognized collapses to `kind:"none"` rather than
 * throwing — a stale row should not crash the route or the apply path.
 */
export function coerceLegacyFix(raw: unknown): SuggestedFix {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (r.kind === "none") {
      return EMPTY_SUGGESTED_FIX;
    }
    if (
      r.kind === "patch" &&
      typeof r.anchorText === "string" &&
      typeof r.replacementText === "string"
    ) {
      return {
        kind: "patch",
        anchorText: r.anchorText,
        replacementText: r.replacementText,
      };
    }
    if (r.kind === "fields" && Array.isArray(r.ops)) {
      const ops = r.ops.flatMap((op): FieldOp[] => {
        const parsed = fieldOpSchema.safeParse(op);
        return parsed.success ? [parsed.data] : [];
      });
      return ops.length > 0 ? { kind: "fields", ops } : EMPTY_SUGGESTED_FIX;
    }
    if (
      typeof r.anchorText === "string" &&
      typeof r.replacementText === "string"
    ) {
      return {
        kind: "patch",
        anchorText: r.anchorText,
        replacementText: r.replacementText,
      };
    }
  }
  return EMPTY_SUGGESTED_FIX;
}

/** True if the fix carries actionable content (a non-empty replacement or
 *  at least one op). `none` is always false. */
export function hasFixContent(fix: SuggestedFix): boolean {
  switch (fix.kind) {
    case "none":
      return false;
    case "patch":
      return fix.replacementText.trim().length > 0;
    case "fields":
      return fix.ops.length > 0;
  }
}
