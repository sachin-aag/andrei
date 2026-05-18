import type { AnalyzeSection } from "@/types/sections";

/**
 * Store the full 5-Why (chain + conclusion) in `narrative` only; `conclusion` is kept empty for
 * backward compatibility with older payloads and DOCX placeholders.
 */
export function collapseFiveWhyFields(
  fw: AnalyzeSection["fiveWhy"] | undefined | null
): AnalyzeSection["fiveWhy"] {
  if (!fw) {
    return { narrative: "", conclusion: "" };
  }
  const narrativeRaw = fw.narrative ?? "";
  const c = (fw.conclusion ?? "").trim();
  if (!c) {
    return { narrative: narrativeRaw, conclusion: "" };
  }
  const base = narrativeRaw.trimEnd();
  const combined = base ? `${base}\n\n${c}` : c;
  return { narrative: combined, conclusion: "" };
}

/** Full text for DOCX / display; leaves the legacy conclusion slot blank on export. */
export function fiveWhyTextForExport(
  fw: AnalyzeSection["fiveWhy"] | undefined | null
): string {
  return collapseFiveWhyFields(fw).narrative;
}
