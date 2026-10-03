import type { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import type { TableOperation } from "@/lib/suggestions/table-operation";

export type QsrReferenceSearchCategory = {
  label: string;
  rowMatch: RegExp;
  searchQueries: readonly string[];
};

/** One grep family per seeded Table 1 row (1.3 References). */
export const QSR_REFERENCE_SEARCH_CATEGORIES: readonly QsrReferenceSearchCategory[] =
  [
    {
      label: "User Requirement Specification",
      rowMatch: /user requirement specification/i,
      searchQueries: ["URS/GLR", "User Requirement Specification"],
    },
    {
      label: "Design Specification / Data Sheet Document",
      rowMatch: /design specification|data sheet/i,
      searchQueries: ["Design Specification", "Data Sheet", "DS/"],
    },
    {
      label: "Design Qualification Report Number",
      rowMatch: /design qualification report/i,
      searchQueries: ["DQP/", "DQR/", "Design Qualification Report"],
    },
    {
      label: "Installation Qualification Report Number",
      rowMatch: /installation qualification report/i,
      searchQueries: ["IQP/", "IQR/", "Installation Qualification Report"],
    },
    {
      label: "Purchase Order (P.O)",
      rowMatch: /purchase order|\bp\.?\s*o\.?\b/i,
      searchQueries: ["Purchase Order", "P.O", "PO/"],
    },
    {
      label: "Validation Master Plan",
      rowMatch: /validation master plan/i,
      searchQueries: [
        "Validation Master Plan",
        "VMP",
        "3XPER-VMP",
        "3XPER-VMP-001",
      ],
    },
    {
      label: "Standard operating procedure for carrying out qualification activity",
      rowMatch: /standard operating procedure.*qualification|qualification activity/i,
      searchQueries: ["QAD-SOP-FS-003", "qualification activity"],
    },
    {
      label: "ISPE (International Society for Pharmaceutical Engineering)",
      rowMatch: /\bispe\b/i,
      searchQueries: ["ISPE", "International Society for Pharmaceutical Engineering"],
    },
    {
      label: "IPA (Indian Pharmaceutical Association) for Good Engineering Practices",
      rowMatch: /\bipa\b|indian pharmaceutical association/i,
      searchQueries: ["IPA", "Indian Pharmaceutical Association", "Good Engineering Practices"],
    },
  ] as const;

export function qsrReferenceCategoryForRowLabel(
  rowLabel: string
): QsrReferenceSearchCategory | null {
  const trimmed = rowLabel.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  for (const category of QSR_REFERENCE_SEARCH_CATEGORIES) {
    if (category.rowMatch.test(trimmed)) return category;
  }
  return null;
}

export function ledgerHasReferenceSearchEvidence(
  ledger: CitationPageLedger,
  searchQueries: readonly string[]
): boolean {
  if (searchQueries.length === 0) return true;
  for (const page of ledger.recordedPages()) {
    const hay = `${page.filename}\n${page.quote}`.toLowerCase();
    for (const query of searchQueries) {
      const needle = query.trim().toLowerCase();
      if (needle && hay.includes(needle)) return true;
    }
  }
  return false;
}

function referenceCellsFromOperation(
  operation: TableOperation
): Array<{ rowLabel: string; insertText: string }> {
  const out: Array<{ rowLabel: string; insertText: string }> = [];
  switch (operation.kind) {
    case "edit_cells":
      for (const cell of operation.cells) {
        if (cell.col !== 1) continue;
        const rowLabel =
          cell.rowKey?.trim() ||
          (typeof cell.row === "number" ? `row:${cell.row}` : "");
        out.push({ rowLabel, insertText: cell.insertText });
      }
      break;
    case "insert_rows":
      for (const row of operation.rows ?? []) {
        const rowLabel = (row[0] ?? "").trim();
        const insertText = (row[1] ?? "").trim();
        out.push({ rowLabel, insertText });
      }
      break;
    default:
      break;
  }
  return out;
}

/**
 * Rows the model tried to fill without any retrieved page mentioning that
 * document class (filename or quote). Blocks invented PO/VMP numbers on a
 * lone protocol grep.
 */
export function qsrReferencesRowsMissingSearchEvidence(input: {
  section: string | null | undefined;
  operation: TableOperation;
  ledger: CitationPageLedger;
}): string[] {
  if (input.section !== "qsr_references") return [];
  const missing = new Set<string>();
  for (const { rowLabel, insertText } of referenceCellsFromOperation(
    input.operation
  )) {
    if (!insertText.trim()) continue;
    const category = qsrReferenceCategoryForRowLabel(rowLabel);
    if (!category) continue;
    if (
      !ledgerHasReferenceSearchEvidence(input.ledger, category.searchQueries)
    ) {
      missing.add(category.label);
    }
  }
  return [...missing];
}

export function qsrReferencesOutstandingSearchCategories(
  ledger: CitationPageLedger
): string[] {
  return QSR_REFERENCE_SEARCH_CATEGORIES.filter(
    (category) =>
      !ledgerHasReferenceSearchEvidence(ledger, category.searchQueries)
  ).map((category) => category.label);
}

export function qsrReferencesSearchIncompleteMessage(
  rowLabels: readonly string[]
): string {
  if (rowLabels.length === 0) return "";
  const listed = rowLabels.slice(0, 6).join("; ");
  const more = rowLabels.length > 6 ? "; …" : "";
  return `References table: search attached files for ${listed}${more} (separate search_documents queries — e.g. Purchase Order, 3XPER-VMP-001, QAD-SOP-FS-003, ISPE, Design Specification) before proposing those rows. Copy only reference numbers printed on the retrieved page; do not pattern PO/GLR-1301 or VMP-001 from the equipment id.`;
}

export function qsrReferencesSearchStillOpenMessage(
  categories: readonly string[]
): string {
  if (categories.length === 0) return "";
  const listed = categories.slice(0, 5).join(", ");
  const more = categories.length > 5 ? ", …" : "";
  return ` Table 1 still needs search_documents for: ${listed}${more}.`;
}
