import type { JSONContent } from "@tiptap/core";
import type {
  ControlSection,
  DefineSection,
  ImproveSection,
  MeasureSection,
  SectionContentMap,
} from "@/types/sections";
import { EMPTY_CONTENT } from "@/types/sections";
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
  const o = content as Partial<ControlSection>;
  return {
    ...base,
    ...o,
    narrative: normalizeRichField(o.narrative ?? base.narrative),
  };
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
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof out[k] === "object" &&
      out[k] !== null
    ) {
      out[k] = deepMerge(out[k] as unknown, v as Partial<unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
