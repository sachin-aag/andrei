import type { Ledger, ModificationRegisterContent } from "@/lib/design-inputs/types";
import type { FindingsContent, SourcesContent } from "@/lib/design-inputs/types";

export const PROTOCOL_SECTION_KEYS = [
  "sources",
  "design_inputs",
  "findings",
  "modification_register",
] as const;

export type ProtocolSectionKey = (typeof PROTOCOL_SECTION_KEYS)[number];

export type ProtocolSectionMap = {
  sources: SourcesContent;
  design_inputs: Ledger;
  findings: FindingsContent;
  modification_register: ModificationRegisterContent;
};

export const EMPTY_PROTOCOL_SOURCES: SourcesContent = {
  protocolNo: "",
  protocolRev: "",
  srsNo: "",
  srsRev: "",
  planNo: "",
  planRev: "",
};

export const EMPTY_LEDGER: Ledger = {
  requirements: [],
  scope: [],
  blocks: [],
  equipmentTable: [],
  referencesTable: [],
};

export const EMPTY_PROTOCOL_CONTENT: ProtocolSectionMap = {
  sources: { ...EMPTY_PROTOCOL_SOURCES },
  design_inputs: EMPTY_LEDGER,
  findings: { items: [] },
  modification_register: { rows: [] },
};

export const PROTOCOL_SECTION_LABELS: Record<ProtocolSectionKey, string> = {
  sources: "Sources",
  design_inputs: "Design Inputs",
  findings: "Findings",
  modification_register: "Modification Register",
};

export const PROTOCOL_SOURCES_GATE_MESSAGE =
  "Identify the protocol by document number and revision before running the check.";

const SOURCE_FIELDS = [
  "protocolNo",
  "protocolRev",
  "srsNo",
  "srsRev",
  "planNo",
  "planRev",
] as const;

export function asSources(raw: unknown): SourcesContent {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    protocolNo: stringField(o.protocolNo),
    protocolRev: stringField(o.protocolRev),
    srsNo: stringField(o.srsNo),
    srsRev: stringField(o.srsRev),
    planNo: stringField(o.planNo),
    planRev: stringField(o.planRev),
  };
}

export function asLedger(raw: unknown): Ledger {
  if (!raw || typeof raw !== "object") return EMPTY_LEDGER;
  const o = raw as Partial<Ledger>;
  return {
    requirements: Array.isArray(o.requirements) ? o.requirements : [],
    scope: Array.isArray(o.scope) ? o.scope : [],
    blocks: Array.isArray(o.blocks) ? o.blocks : [],
    equipmentTable: Array.isArray(o.equipmentTable) ? o.equipmentTable : [],
    referencesTable: Array.isArray(o.referencesTable) ? o.referencesTable : [],
  };
}

export function asFindings(raw: unknown): FindingsContent {
  if (!raw || typeof raw !== "object") return { items: [] };
  const items = (raw as FindingsContent).items;
  return { items: Array.isArray(items) ? items : [] };
}

export function asModificationRegister(raw: unknown): ModificationRegisterContent {
  if (!raw || typeof raw !== "object") return { rows: [] };
  const rows = (raw as ModificationRegisterContent).rows;
  return { rows: Array.isArray(rows) ? rows : [] };
}

/** Gate: protocol identity only. The identity criterion still requires SRS + plan. */
export function hasProtocolSourcesIdentity(raw: unknown): boolean {
  const sources = asSources(raw);
  return sources.protocolNo.trim() !== "" && sources.protocolRev.trim() !== "";
}

export function missingSourceIdentityFields(raw: unknown): string[] {
  const sources = asSources(raw);
  return SOURCE_FIELDS.filter((key) => !sources[key].trim()).map(sourceFieldLabel);
}

function sourceFieldLabel(key: (typeof SOURCE_FIELDS)[number]): string {
  switch (key) {
    case "protocolNo":
      return "protocol number";
    case "protocolRev":
      return "protocol revision";
    case "srsNo":
      return "SRS number";
    case "srsRev":
      return "SRS revision";
    case "planNo":
      return "plan number";
    case "planRev":
      return "plan revision";
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}
