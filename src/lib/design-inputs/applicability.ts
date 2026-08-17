import type { ApplicabilityRule } from "./types";

export function impliedConfigsFromNote(
  note: string | null,
  rules: ApplicabilityRule[]
): string[] {
  if (!note) return [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(note)) return rule.impliedConfigs;
  }
  return [];
}
