import { SECTION_LABELS } from "@/types/sections";
import {
  type HeadingMatch,
  type ImportSectionKey,
  NON_EDITABLE_EXPORT_HEADING_RE,
  SECTION_ORDER,
} from "@/lib/import/docx-import-types";
import { escapeRegex } from "@/lib/import/docx-import-text";

function sectionHeadingRegex(key: ImportSectionKey): RegExp {
  if (key === "documents_reviewed") {
    return /^(?:\d+(?:\.\d+)*\.?\s+)?documents?\s+reviewed\b(?:\s*\([^)]*\))?\s*(?::|[-–—])?\s*(.*)$/i;
  }
  if (key === "attachments") {
    return /^(?:\d+(?:\.\d+)*\.?\s+)?(?:list\s+of\s+attachments?|attachments)\b(?:\s*\([^)]*\))?\s*(?::|[-–—])?\s*(.*)$/i;
  }
  const label = SECTION_LABELS[key];
  const escaped = escapeRegex(label);
  return new RegExp(
    `^(?:\\d+(?:\\.\\d+)*\\.?\\s+|(?:section|part)\\s+[ivxlcdm]+\\s*[.:)]\\s*)?${escaped}(?:\\s*[:\\-–—]\\s*(.*)|\\s*)$`,
    "i"
  );
}

/** Match an exported section title line (Word headings, numbered sections, or `Define:` labels). */
export function matchSectionHeading(trimmedLine: string): HeadingMatch | null {
  const t = trimmedLine.replace(/\s+/g, " ").trim();
  for (const key of SECTION_ORDER) {
    const re = sectionHeadingRegex(key);
    const match = re.exec(t);
    if (match) return { key, remainder: match[1]?.trim() ?? "" };
  }
  return null;
}

function splitLinesIntoSections(
  lines: string[],
  headingLine: (line: string) => string = (line) => line.replace(/\s+/g, " ").trim()
): {
  sections: Record<ImportSectionKey, string>;
  foundHeadings: boolean;
} {
  const buckets: Record<ImportSectionKey, string[]> = {
    define: [],
    measure: [],
    analyze: [],
    improve: [],
    control: [],
    documents_reviewed: [],
    attachments: [],
    signature_approvals: [],
  };
  let current: ImportSectionKey | "preamble" | "ignored" = "preamble";
  let foundHeadings = false;

  const leavesAttachmentsSection = (line: string) =>
    /^(?:\d+(?:\.\d+)*\.?\s+)?(?:prepared|reviewed|approved)\s+by\b/i.test(
      headingLine(line)
    );

  for (const line of lines) {
    const normalized = headingLine(line);
    const heading = matchSectionHeading(normalized);
    if (heading) {
      foundHeadings = true;
      current = heading.key;
      if (heading.remainder) buckets[current].push(heading.remainder);
      continue;
    }
    if (NON_EDITABLE_EXPORT_HEADING_RE.test(normalized)) {
      current = "ignored";
      continue;
    }
    if (current === "attachments" && leavesAttachmentsSection(line)) {
      current = "ignored";
      continue;
    }
    if (current !== "preamble" && current !== "ignored") buckets[current].push(line);
  }

  if (!foundHeadings) {
    return {
      sections: {
        define: lines.join("\n").trim(),
        measure: "",
        analyze: "",
        improve: "",
        control: "",
        documents_reviewed: "",
        attachments: "",
        signature_approvals: "",
      },
      foundHeadings: false,
    };
  }

  const sections = {} as Record<ImportSectionKey, string>;
  for (const key of SECTION_ORDER) {
    sections[key] = buckets[key].join("\n").trim();
  }

  return { sections, foundHeadings: true };
}

export function splitPlainTextIntoSections(raw: string): {
  sections: Record<ImportSectionKey, string>;
  foundHeadings: boolean;
} {
  return splitLinesIntoSections(raw.split(/\r?\n/));
}
