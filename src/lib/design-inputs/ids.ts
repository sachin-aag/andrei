import type { ProtocolParserConfig } from "./types";

export function withGlobal(pattern: RegExp): RegExp {
  return new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  );
}

export function extractRequirementIds(
  text: string,
  pattern: RegExp
): string[] {
  return text.match(withGlobal(pattern)) ?? [];
}

export function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function duplicateIds(ids: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => id);
}

/** Join `SW-` / `FAM-1.1` and `SW-FAM-` / `1.1` wraps across newlines. */
export function repairWrappedIds(text: string): string {
  return text
    .replace(/(SW-[A-Z]+-)\s*\n\s*/g, "$1")
    .replace(/SW-\s*\n\s*/g, "SW-");
}

export function familyFromReqId(
  id: string,
  familyPattern: RegExp
): string {
  const match = id.match(familyPattern);
  return match?.[1] ?? id;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function pageAt(text: string, index: number): number {
  let page = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 12) page += 1;
  }
  return page;
}

export function isFullRequirementId(
  token: string,
  config: ProtocolParserConfig
): boolean {
  return new RegExp(`^(?:${config.requirementId.source})$`).test(token);
}

export function isIdPrefix(token: string): boolean {
  return token === "SW-" || /^SW-[A-Z]+-$/.test(token);
}

export function isIdContinuation(token: string): boolean {
  return /^[A-Z]{2,}-\d/.test(token) || /^\d+(?:\.\d+)*$/.test(token);
}
