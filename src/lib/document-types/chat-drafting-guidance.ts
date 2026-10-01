import type { SectionType } from "@/db/schema";
import type { DocumentChatDraftingGuidance } from "@/lib/document-types/types";

export type DraftingHeadingTarget = "always" | "skip" | SectionType;

function uniqueJoin(parts: readonly (string | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const text = part?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.join("\n\n");
}

/** Concatenate always + every bySection block. */
export function flattenDraftingGuidance(
  guidance: string | DocumentChatDraftingGuidance | undefined
): string {
  if (!guidance) return "";
  if (typeof guidance === "string") return guidance.trim();
  return uniqueJoin([
    guidance.always,
    ...Object.values(guidance.bySection ?? {}),
  ]);
}

function splitMarkdownH2(
  markdown: string
): readonly { heading: string; body: string }[] {
  return markdown
    .split(/(?=^## )/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const newline = chunk.indexOf("\n");
      const titleLine = newline === -1 ? chunk : chunk.slice(0, newline);
      const heading = titleLine.replace(/^##\s+/, "").trim();
      return { heading, body: chunk };
    });
}

/** Split a `##`-headed recipe into always vs per-section blocks. */
export function assembleDraftingGuidance(opts: {
  markdown: string;
  headingTarget: Readonly<Record<string, DraftingHeadingTarget>>;
  extraAlways?: string;
  extraBySection?: Partial<Record<SectionType, string>>;
}): DocumentChatDraftingGuidance {
  const alwaysParts: string[] = [];
  const bySection: Partial<Record<SectionType, string[]>> = {};
  const extraAlways = opts.extraAlways?.trim();
  if (extraAlways) alwaysParts.push(extraAlways);

  for (const { heading, body } of splitMarkdownH2(opts.markdown)) {
    const target = opts.headingTarget[heading];
    if (target === undefined) {
      throw new Error(`Unmapped drafting heading: ${heading}`);
    }
    if (target === "skip") continue;
    if (target === "always") {
      alwaysParts.push(body);
      continue;
    }
    const existing = bySection[target] ?? [];
    existing.push(body);
    bySection[target] = existing;
  }

  const extraBySection = opts.extraBySection ?? {};
  const mergedBySection: Partial<Record<SectionType, string>> = {};
  const sectionKeys = new Set<SectionType>([
    ...(Object.keys(bySection) as SectionType[]),
    ...(Object.keys(extraBySection) as SectionType[]),
  ]);
  for (const key of sectionKeys) {
    const text = uniqueJoin([...(bySection[key] ?? []), extraBySection[key]]);
    if (text) mergedBySection[key] = text;
  }

  return {
    always: uniqueJoin(alwaysParts) || undefined,
    bySection:
      Object.keys(mergedBySection).length > 0 ? mergedBySection : undefined,
  };
}

/** Concatenate always + the given bySection keys. */
export function pickDraftingGuidance(
  guidance: string | DocumentChatDraftingGuidance | undefined,
  sectionKeys: readonly SectionType[]
): string {
  if (!guidance) return "";
  if (typeof guidance === "string") return guidance.trim();
  return uniqueJoin([
    guidance.always,
    ...sectionKeys.map((key) => guidance.bySection?.[key]),
  ]);
}
