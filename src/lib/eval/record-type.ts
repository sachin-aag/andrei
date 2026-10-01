export type RecordTypeClass =
  | "capa"
  | "deviation"
  | "change_control"
  | "oos"
  | "oot"
  | "unknown";

const TYPE_CLASSIFIERS: readonly {
  name: Exclude<RecordTypeClass, "unknown">;
  type: RegExp;
  ref: RegExp;
}[] = [
  { name: "capa", type: /\bcapa\b/i, ref: /\bcapa[-/]/i },
  {
    name: "deviation",
    type: /\bdev(iation)?\b/i,
    ref: /\b(dev|inv|ncr)[-/]/i,
  },
  {
    name: "change_control",
    type: /\b(cc|change[ -]?control)\b/i,
    ref: /\b(ccf|cc)[-/]/i,
  },
  { name: "oos", type: /\boos\b/i, ref: /\boos[-/]/i },
  { name: "oot", type: /\boot\b/i, ref: /\boot[-/]/i },
];

export function classifyRecordType(type: string): RecordTypeClass {
  const value = type.trim();
  if (!value) return "unknown";
  for (const row of TYPE_CLASSIFIERS) {
    if (row.type.test(value)) return row.name;
  }
  return "unknown";
}

export function classifyRecordReference(ref: string): RecordTypeClass {
  const value = ref.trim();
  if (!value) return "unknown";
  for (const row of TYPE_CLASSIFIERS) {
    if (row.ref.test(value)) return row.name;
  }
  return "unknown";
}

/**
 * A typed QMS/evidence row whose document number belongs to a different
 * record class (CAPA row citing DEV-…, deviation citing CCF-…).
 */
export function recordTypeReferenceMismatch(
  type: string,
  reference: string
): { typeClass: RecordTypeClass; refClass: RecordTypeClass } | null {
  const typeClass = classifyRecordType(type);
  const refClass = classifyRecordReference(reference);
  if (typeClass === "unknown" || refClass === "unknown") return null;
  if (typeClass === refClass) return null;
  return { typeClass, refClass };
}
