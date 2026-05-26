import type { JSONContent } from "@tiptap/core";
import type { AnalyzeSection } from "@/types/sections";
import { stringFieldFromStoredValue } from "@/lib/section-content-normalize";
import { legacyStringToDoc, normalizeRichField } from "@/lib/tiptap/rich-text";

type LegacyRootCause = {
  narrative?: unknown;
  primaryLevel1?: string;
  secondaryLevel2?: string;
  thirdLevel3?: string;
};

/**
 * Root cause is stored in `narrative` only. Legacy payloads may still carry Level 1/2/3 fields;
 * fold those into the narrative when loading.
 */
export function collapseRootCauseFields(
  rc: LegacyRootCause | undefined | null
): AnalyzeSection["rootCause"] {
  if (!rc) return { narrative: legacyStringToDoc("") };

  let narrativeDoc = normalizeRichField(rc.narrative);
  let narrative = stringFieldFromStoredValue(rc.narrative).trim();
  const legacyLevels = [
    ["Primary (Level 1)", rc.primaryLevel1],
    ["Secondary (Level 2)", rc.secondaryLevel2],
    ["Third (Level 3)", rc.thirdLevel3],
  ] as const;

  const toAppend: string[] = [];
  for (const [label, raw] of legacyLevels) {
    const v = stringFieldFromStoredValue(raw).trim();
    if (!v) continue;
    const line = `${label}: ${v}`;
    if (!narrative.includes(v) && !narrative.toLowerCase().includes(line.toLowerCase())) {
      toAppend.push(line);
    }
  }

  if (toAppend.length) {
    narrative = narrative ? `${narrative}\n\n${toAppend.join("\n")}` : toAppend.join("\n");
    narrativeDoc = legacyStringToDoc(narrative);
  }

  return { narrative: narrativeDoc };
}

export function rootCausePlainText(narrative: JSONContent | undefined): string {
  return stringFieldFromStoredValue(narrative).trim();
}
