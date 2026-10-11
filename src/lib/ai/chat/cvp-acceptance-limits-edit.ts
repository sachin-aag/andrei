import type { DocumentType, SectionType } from "@/db/schema";
import { CVP_ACCEPTANCE_RINSE_HEADERS } from "@/lib/document-types/cvp/sections";

const EXPLICIT_TABLE_REMOVE_RE =
  /\b(?:remove|delete|drop|get rid of|take out|strip out)\b[\s\S]{0,80}\btable\b/i;
const EXPLICIT_TABLE_REMOVE_SHORT_RE =
  /\b(?:remove|delete|drop)\s+(?:this|that|the)\s+table\b/i;
const ADD_TABLE_RE = /\badd(?:\s+back)?\b[\s\S]{0,60}\btable\b/i;
const ADD_TABLE_ALT_RE =
  /\b(?:insert|create|build|populate|fill)\b[\s\S]{0,60}\btable\b/i;

/** User asked to add a table (CVP 11.0 rinse acceptance guard). */
export function userAskedToAddTable(userText: string): boolean {
  const text = userText.replace(/\s+/g, " ").trim();
  if (!text) return false;
  return (
    ADD_TABLE_RE.test(text) ||
    ADD_TABLE_ALT_RE.test(text) ||
    /\badd\b[\s\S]{0,50}\bnew one\b/i.test(text)
  );
}

export function userExplicitlyAskedToRemoveTable(userText: string): boolean {
  const text = userText.replace(/\s+/g, " ").trim();
  if (!text) return false;
  return (
    EXPLICIT_TABLE_REMOVE_RE.test(text) || EXPLICIT_TABLE_REMOVE_SHORT_RE.test(text)
  );
}

export function cvpAcceptanceLimitsDeleteBlocked(args: {
  documentType: DocumentType;
  section: SectionType;
  operationKind: string;
  userText: string;
  reasoning?: string;
}): string | null {
  if (args.documentType !== "cleaning_verification_protocol") return null;
  if (args.section !== "cvp_acceptance_limits") return null;
  if (args.operationKind !== "delete_table") return null;

  const userText = args.userText.trim();
  const reasoning = (args.reasoning ?? "").trim();

  if (userExplicitlyAskedToRemoveTable(userText) && !userAskedToAddTable(userText)) {
    return null;
  }

  const replaceIntent =
    /\breplace\b/i.test(userText) ||
    /\breplace\b/i.test(reasoning) ||
    /\bso we can replace\b/i.test(reasoning);

  if (userAskedToAddTable(userText) || replaceIntent) {
    const rinseHeaders = CVP_ACCEPTANCE_RINSE_HEADERS.join(" | ");
    return (
      "Section 11.0 keeps the swab-limit table and the per-equipment rinse acceptance table as separate grids — do not delete_table to “make room” for another table. " +
      `When they asked to add or fill rinse acceptance criteria for all equipment, call read_section, find the table whose headers include Equipment ID and Final rinse acceptance criteria (often tableIndex 1; headers: ${rinseHeaders}), then edit_table insert_rows with one row per equipment from Section 8.0 / 9.0 / 10.0. ` +
      "If that per-equipment grid is missing, use create_table (do not delete the swab or rinse-limit calculation table). delete_table only when they explicitly asked to remove a table."
    );
  }

  return null;
}
