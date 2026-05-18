import type { AnalyzeSection } from "@/types/sections";

/**
 * Store the full 5-Why (chain + conclusion) in `narrative` only; `conclusion` is kept empty for
 * backward compatibility with older payloads (and after merge, DOCX/UI use narrative only).
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

/** Plain text / DOCX `{fiveWhyNarrative}` — full chain plus any legacy `conclusion` merged in. */
export function fiveWhyTextForExport(
  fw: AnalyzeSection["fiveWhy"] | undefined | null
): string {
  return collapseFiveWhyFields(fw).narrative;
}
