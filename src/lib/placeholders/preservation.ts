import { isCitationShapedBracket } from "@/lib/placeholders/citation-bracket";

export type PlaceholderPreservationViolation = {
  label: string;
  filledValue: string;
  kind: "value_vanished" | "reverted_to_unfilled";
};

const LABELED_SLOT = /\[([^\]:\n]{1,80}):\s*([^\]]+)\]/g;

export type FilledPlaceholderSlot = {
  label: string;
  value: string;
};

function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

function isUnfilledValue(value: string): boolean {
  return /to\s*be\s*filled/i.test(value);
}

/**
 * Labeled `[Label: value]` spans whose value is not an unfilled token.
 * Panel-filled bare values (token replaced with just the value) are not
 * recoverable without marks; those are covered by the merge planner later.
 */
export function filledPlaceholderSlots(text: string): FilledPlaceholderSlot[] {
  const slots: FilledPlaceholderSlot[] = [];
  const seen = new Set<string>();
  LABELED_SLOT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LABELED_SLOT.exec(text)) !== null) {
    const raw = match[0];
    if (isCitationShapedBracket(raw)) continue;
    const label = match[1]?.replace(/\s+/g, " ").trim() ?? "";
    const value = match[2]?.replace(/\s+/g, " ").trim() ?? "";
    if (!label || !value || isUnfilledValue(value)) continue;
    const key = `${normalizeLabel(label)}\0${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({ label, value });
  }
  return slots;
}

export function unfilledPlaceholderLabels(text: string): Set<string> {
  const labels = new Set<string>();
  LABELED_SLOT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LABELED_SLOT.exec(text)) !== null) {
    const raw = match[0];
    if (isCitationShapedBracket(raw)) continue;
    const label = match[1]?.replace(/\s+/g, " ").trim() ?? "";
    const value = match[2]?.replace(/\s+/g, " ").trim() ?? "";
    if (!label || !isUnfilledValue(value)) continue;
    labels.add(normalizeLabel(label));
  }
  return labels;
}

/**
 * After applying a suggestion, no previously filled placeholder span may be
 * replaced by an unfilled token, and no filled value may vanish.
 */
export function placeholderPreservationViolations(
  beforeText: string,
  afterText: string
): PlaceholderPreservationViolation[] {
  const beforeSlots = filledPlaceholderSlots(beforeText);
  if (beforeSlots.length === 0) return [];
  const afterUnfilled = unfilledPlaceholderLabels(afterText);
  const violations: PlaceholderPreservationViolation[] = [];
  for (const slot of beforeSlots) {
    const labelKey = normalizeLabel(slot.label);
    if (afterUnfilled.has(labelKey)) {
      violations.push({
        label: slot.label,
        filledValue: slot.value,
        kind: "reverted_to_unfilled",
      });
      continue;
    }
    if (!afterText.includes(slot.value)) {
      violations.push({
        label: slot.label,
        filledValue: slot.value,
        kind: "value_vanished",
      });
    }
  }
  return violations;
}

export class PlaceholderPreservationError extends Error {
  readonly violations: PlaceholderPreservationViolation[];

  constructor(violations: PlaceholderPreservationViolation[]) {
    const labels = violations.map((v) => v.label).join(", ");
    super(
      `Redraft would wipe filled placeholders (${labels}). Use a targeted edit or pass replaceFilledField to replace them explicitly.`
    );
    this.name = "PlaceholderPreservationError";
    this.violations = violations;
  }
}
