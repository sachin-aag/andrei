import mammoth from "mammoth";
import type { AnalyzeSection, SectionContentMap } from "@/types/sections";
import { EMPTY_CONTENT, SECTION_LABELS } from "@/types/sections";
import { legacyStringToDoc } from "@/lib/tiptap/rich-text";

type EditableKey = "define" | "measure" | "analyze" | "improve" | "control";

const SECTION_ORDER: EditableKey[] = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
];

/** Match a standalone section title line (Word headings or numbered sections). */
function matchSectionHeading(trimmedLine: string): EditableKey | null {
  const t = trimmedLine.replace(/\s+/g, " ").trim();
  for (const key of SECTION_ORDER) {
    const label = SECTION_LABELS[key];
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `^(?:\\d+(?:\\.\\d+)*\\.?\\s+|(?:section|part)\\s+[ivxlcdm]+\\s*[.:)]\\s*)?${escaped}\\s*$`,
      "i"
    );
    if (re.test(t)) return key;
  }
  return null;
}

function splitPlainTextIntoSections(raw: string): {
  sections: Record<EditableKey, string>;
  foundHeadings: boolean;
} {
  const lines = raw.split(/\r?\n/);
  const buckets: Record<EditableKey, string[]> = {
    define: [],
    measure: [],
    analyze: [],
    improve: [],
    control: [],
  };
  const preamble: string[] = [];
  let current: EditableKey | "preamble" = "preamble";
  let foundHeadings = false;

  for (const line of lines) {
    const key = matchSectionHeading(line);
    if (key) {
      foundHeadings = true;
      current = key;
      continue;
    }
    if (current === "preamble") preamble.push(line);
    else buckets[current].push(line);
  }

  if (!foundHeadings) {
    return {
      sections: {
        define: raw.trim(),
        measure: "",
        analyze: "",
        improve: "",
        control: "",
      },
      foundHeadings: false,
    };
  }

  if (preamble.length > 0) {
    const pre = preamble.join("\n").trim();
    if (pre) {
      buckets.define.unshift(pre);
    }
  }

  const sections = {} as Record<EditableKey, string>;
  for (const key of SECTION_ORDER) {
    sections[key] = buckets[key].join("\n").trim();
  }

  return { sections, foundHeadings: true };
}

function buildAnalyzeFromChunk(text: string): AnalyzeSection {
  const base = EMPTY_CONTENT.analyze;
  if (!text.trim()) return base;
  return {
    ...base,
    investigationOutcome: text.trim(),
  };
}

/**
 * Reads a .docx buffer and maps recognizable DMAIC blocks into section content.
 * Uses plain-text extraction and heading lines that match section titles (Define, Measure, …).
 */
export async function docxBufferToSectionContentMap(
  buffer: Buffer
): Promise<Pick<
  SectionContentMap,
  "define" | "measure" | "analyze" | "improve" | "control"
>> {
  const { value: raw } = await mammoth.extractRawText({ buffer });
  const { sections, foundHeadings } = splitPlainTextIntoSections(raw);

  const defineNarr = sections.define.trim()
    ? legacyStringToDoc(sections.define)
    : emptyDocFallback(foundHeadings, raw);
  const measureNarr = legacyStringToDoc(sections.measure);
  const improveNarr = legacyStringToDoc(sections.improve);
  const controlNarr = legacyStringToDoc(sections.control);

  return {
    define: {
      ...EMPTY_CONTENT.define,
      narrative: defineNarr,
    },
    measure: {
      ...EMPTY_CONTENT.measure,
      narrative: measureNarr,
    },
    analyze: buildAnalyzeFromChunk(sections.analyze),
    improve: {
      ...EMPTY_CONTENT.improve,
      narrative: improveNarr,
    },
    control: {
      ...EMPTY_CONTENT.control,
      narrative: controlNarr,
    },
  };
}

function emptyDocFallback(foundHeadings: boolean, raw: string) {
  if (foundHeadings) return legacyStringToDoc("");
  return legacyStringToDoc(raw.trim() || "");
}
