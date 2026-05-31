import PizZip from "pizzip";
import type { ImportedReportContent, ImportedReportHeader } from "@/lib/import/docx-import-types";
import {
  cleanImportedText,
  labelPattern,
} from "@/lib/import/docx-import-text";
import { matchSectionHeading } from "@/lib/import/docx-section-split";

const REPORT_HEADER_LABEL_RE =
  /^(?:date|deviation\s+no\.?|investigation\s+tool\s+used|other\s+tools?\b)/i;

function isReportHeaderLabelLine(line: string): boolean {
  return REPORT_HEADER_LABEL_RE.test(line.replace(/\s+/g, " ").trim());
}

/** Header fields in the investigation template put values on the line after the label. */
function getBlockLabelValue(text: string, label: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim());
  const labelRe = new RegExp(`^${labelPattern(label)}(.*)$`, "i");

  for (let i = 0; i < lines.length; i++) {
    const match = labelRe.exec(lines[i]!);
    if (!match) continue;

    const inline = cleanImportedText(match[1] ?? "");
    if (inline) return inline;

    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]!;
      if (!next) continue;
      if (isReportHeaderLabelLine(next)) break;
      return cleanImportedText(next);
    }
    return "";
  }

  return "";
}

function extractReportPreamble(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];

  for (const line of lines) {
    const normalized = line.replace(/\s+/g, " ").trim();
    if (matchSectionHeading(normalized)?.key === "define") break;
    if (/^define\s*:?\s*$/i.test(normalized)) break;
    out.push(line);
  }

  return out.join("\n");
}

function parseDdMmYyyyDate(value: string): Date | undefined {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return undefined;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }

  return parsed;
}

export function parseReportHeaderFromRaw(raw: string): ImportedReportHeader {
  const preamble = extractReportPreamble(raw);
  const dateText = getBlockLabelValue(preamble, "Date");
  const deviationNo = getBlockLabelValue(preamble, "Deviation No.");
  const otherTools = getBlockLabelValue(preamble, "Other Tools (If any)");

  const header: ImportedReportHeader = {};
  const parsedDate = parseDdMmYyyyDate(dateText);
  if (parsedDate) header.date = parsedDate;
  if (deviationNo) header.deviationNo = deviationNo;
  if (otherTools) header.otherTools = otherTools;

  return header;
}

export function parseToolsUsed(raw: string): ImportedReportContent["toolsUsed"] {
  const line =
    raw
      .split(/\r?\n/)
      .find((item) => /investigation\s+tool\s+used/i.test(item)) ?? "";
  const afterLabel = line.replace(/^.*?investigation\s+tool\s+used\s*:?\s*/i, "");
  const checked = (label: RegExp) => {
    const match = label.exec(afterLabel);
    if (!match) return false;
    const before = afterLabel.slice(Math.max(0, match.index - 3), match.index);
    if (before.includes("☑")) return true;
    if (before.includes("☐")) return false;
    return false;
  };

  return {
    sixM: checked(/\b6\s*M\b/i),
    fiveWhy: checked(/\b5\s*-?\s*why\b/i),
    brainstorming: checked(/\bbrainstorming\b/i),
  };
}

function checkboxStateFromRun(runXml: string): boolean | null {
  const checkbox = /<\w+:checkBox\b[\s\S]*?<\/\w+:checkBox>/.exec(runXml)?.[0];
  if (!checkbox) return null;

  const checked = /<\w+:checked\b[^>]*(?:\w+:)?val="([^"]+)"/.exec(checkbox)?.[1];
  if (checked !== undefined) return checked !== "0" && checked.toLowerCase() !== "false";

  const defaultValue = /<\w+:default\b[^>]*(?:\w+:)?val="([^"]+)"/.exec(checkbox)?.[1];
  return defaultValue === "1" || defaultValue?.toLowerCase() === "true";
}

function decodeXmlText(xml: string): string {
  return Array.from(xml.matchAll(/<\w+:t\b[^>]*>([\s\S]*?)<\/\w+:t>/g))
    .map((match) =>
      (match[1] ?? "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
    )
    .join("");
}

export function parseToolsUsedFromDocxXml(
  buffer: Buffer
): ImportedReportContent["toolsUsed"] | null {
  try {
    const zip = new PizZip(buffer);
    const xml = zip.file("word/document.xml")?.asText();
    if (!xml) return null;
    const paragraphs = xml.match(/<\w+:p\b[\s\S]*?<\/\w+:p>/g) ?? [];
    const toolsPara = paragraphs.find((paragraph) =>
      decodeXmlText(paragraph).match(/investigation\s+tool\s+used/i)
    );
    if (!toolsPara) return null;

    const toolsUsed: ImportedReportContent["toolsUsed"] = {
      sixM: false,
      fiveWhy: false,
      brainstorming: false,
    };
    let pendingCheckbox: boolean | null = null;
    let sawStructuredCheckbox = false;
    const runs = toolsPara.match(/<\w+:r\b[\s\S]*?<\/\w+:r>/g) ?? [];
    for (const run of runs) {
      const checkbox = checkboxStateFromRun(run);
      if (checkbox !== null) {
        sawStructuredCheckbox = true;
        pendingCheckbox = checkbox;
        continue;
      }

      const text = decodeXmlText(run).trim();
      if (!text || pendingCheckbox === null) continue;
      if (/^6\s*M\b/i.test(text)) toolsUsed.sixM = pendingCheckbox;
      else if (/^5\s*-?\s*why\b/i.test(text)) toolsUsed.fiveWhy = pendingCheckbox;
      else if (/^brainstorming\b/i.test(text)) toolsUsed.brainstorming = pendingCheckbox;
      pendingCheckbox = null;
    }

    /** Exported reports use ☑ / ☐ in text (Docxtemplater), not Word SDT checkboxes — let `parseToolsUsed(raw)` handle those. */
    if (!sawStructuredCheckbox) return null;

    return toolsUsed;
  } catch {
    return null;
  }
}
