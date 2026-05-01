import type {
  ControlSection,
  DefineSection,
  ImproveSection,
  MeasureSection,
  SectionContentMap,
} from "@/types/sections";
import { EMPTY_CONTENT } from "@/types/sections";
import { stringFieldFromStoredValue } from "@/lib/section-content-normalize";
import { normalizeRichField } from "@/lib/tiptap/rich-text";
import type { SectionType } from "@/db/schema";

export function mergeDefineSection(content: unknown): DefineSection {
  const base = EMPTY_CONTENT.define;
  if (!content || typeof content !== "object") return base;
  const o = content as Partial<DefineSection>;
  return {
    ...base,
    ...o,
    narrative: normalizeRichField(o.narrative ?? base.narrative),
  };
}

export function mergeMeasureSection(content: unknown): MeasureSection {
  const base = EMPTY_CONTENT.measure;
  if (!content || typeof content !== "object") return base;
  const o = content as Partial<MeasureSection>;
  return {
    ...base,
    ...o,
    narrative: normalizeRichField(o.narrative ?? base.narrative),
  };
}

export function mergeImproveSection(content: unknown): ImproveSection {
  const base = EMPTY_CONTENT.improve;
  if (!content || typeof content !== "object") return base;
  const o = content as Partial<ImproveSection>;
  return {
    ...base,
    ...o,
    narrative: normalizeRichField(o.narrative ?? base.narrative),
  };
}

export function mergeControlSection(content: unknown): ControlSection {
  const base = EMPTY_CONTENT.control;
  if (!content || typeof content !== "object") return base;
  const o = content as Partial<ControlSection> & {
    preventiveActions?: unknown;
  };
  return {
    ...base,
    ...(o as Partial<ControlSection>),
    narrative: normalizeRichField(o.narrative ?? base.narrative),
    preventiveActions: coercePreventiveActions(o.preventiveActions, base.preventiveActions),
  };
}

/* Legacy rows stored preventiveActions as a structured array; flatten to text. */
function coercePreventiveActions(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((entry, idx) => {
        if (!entry || typeof entry !== "object") return "";
        const a = entry as Record<string, unknown>;
        const lines = [
          `PA-${String(idx + 1).padStart(3, "0")}`,
          a.description ? `Description: ${String(a.description)}` : "",
          a.linkedRootCause ? `Linked root cause: ${String(a.linkedRootCause)}` : "",
          a.responsiblePerson ? `Responsible: ${String(a.responsiblePerson)}` : "",
          a.dueDate ? `Due date: ${String(a.dueDate)}` : "",
          a.expectedOutcome ? `Expected outcome: ${String(a.expectedOutcome)}` : "",
          a.effectivenessVerification
            ? `Effectiveness verification: ${String(a.effectivenessVerification)}`
            : "",
        ].filter(Boolean);
        return lines.join("\n");
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return fallback;
}

export function mergeSection<K extends keyof SectionContentMap & SectionType>(
  section: K,
  content: unknown
): SectionContentMap[K] {
  switch (section) {
    case "define":
      return mergeDefineSection(content) as SectionContentMap[K];
    case "measure":
      return mergeMeasureSection(content) as SectionContentMap[K];
    case "improve":
      return mergeImproveSection(content) as SectionContentMap[K];
    case "control":
      return mergeControlSection(content) as SectionContentMap[K];
    default:
      return mergeGeneric(section, content);
  }
}

function mergeGeneric<K extends keyof SectionContentMap>(
  section: K,
  content: unknown
): SectionContentMap[K] {
  const base = EMPTY_CONTENT[section] as SectionContentMap[K];
  if (!content || typeof content !== "object") return base;
  return deepMerge(base, content as Partial<SectionContentMap[K]>);
}

function deepMerge<T>(base: T, override: Partial<T>): T {
  if (Array.isArray(base)) {
    return (Array.isArray(override) ? override : base) as T;
  }
  if (typeof base !== "object" || base === null) {
    return (override ?? base) as T;
  }
  const out = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries((override as Record<string, unknown>) ?? {})) {
    const baseVal = out[k];
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      out[k] = deepMerge(baseVal as unknown, v as Partial<unknown>);
    } else if (typeof baseVal === "string" && v !== null && typeof v === "object") {
      /* Rich-text doc in DB; legacy shape expects a string (avoid `[object Object]`). */
      out[k] = stringFieldFromStoredValue(v) as (typeof out)[typeof k];
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
