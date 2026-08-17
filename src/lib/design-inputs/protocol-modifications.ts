import type { ModificationRegisterContent, ModificationRow } from "./types";
import type { ProtocolModificationsSnapshot } from "@/lib/document-types/verification-test-report/sections";

const COUNT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "twenty-one",
  "twenty-two",
] as const;

export function acceptedModificationRows(
  register: ModificationRegisterContent | null | undefined
): ModificationRow[] {
  const rows = register?.rows ?? [];
  return rows.filter((row) => row.status === "accepted");
}

export function snapshotAcceptedModifications(
  sourceProtocolReportId: string,
  register: ModificationRegisterContent | null | undefined,
  pulledAt: string
): ProtocolModificationsSnapshot {
  return {
    sourceProtocolReportId,
    pulledAt,
    rows: acceptedModificationRows(register),
  };
}

/** Computed phrase, e.g. "one (1)" — never a typed count in the report body. */
export function protocolModificationCountPhrase(count: number): string {
  if (count < 0 || !Number.isFinite(count)) {
    return `0 (0)`;
  }
  const whole = Math.trunc(count);
  const word = COUNT_WORDS[whole] ?? String(whole);
  return `${word} (${whole})`;
}
