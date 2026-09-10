import type { SectionType } from "@/db/schema";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import { summarizeTablesInDoc } from "@/lib/suggestions/table-operation";
import { listFieldTables } from "@/lib/ai/chat/fields";

export type TableSchemaReadStep = {
  activeTools: ["read_section"];
  toolChoice: { type: "tool"; toolName: "read_section" };
};

/**
 * First write step on a section that already has a table: force read_section
 * so the model copies live headers (demo 5-col vs Convergent 4-col) before
 * edit_table / draft_field.
 */
export function tableSchemaReadStep(opts: {
  stepsTaken: number;
  isWrite: boolean;
  hasReadSectionTool: boolean;
  inScopeHasTable: boolean;
}): TableSchemaReadStep | undefined {
  if (
    opts.stepsTaken !== 0 ||
    !opts.isWrite ||
    !opts.hasReadSectionTool ||
    !opts.inScopeHasTable
  ) {
    return undefined;
  }
  return {
    activeTools: ["read_section"],
    toolChoice: { type: "tool", toolName: "read_section" },
  };
}

function headersEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((header, i) => header.trim() === (right[i] ?? "").trim());
}

export function formatLiveHeaders(headers: readonly string[]): string {
  return headers.map((header) => header.trim() || "(empty)").join(" | ");
}

/**
 * When draft_field replaces a field that already has a table, the markdown
 * table must reuse that field's live headers — not another pack's recipe.
 */
export function liveTableHeadersMismatch(args: {
  content: Record<string, unknown>;
  section: SectionType;
  targetField: string;
  markdown: string;
}): string | null {
  const live = listFieldTables(args.content, args.section, args.targetField);
  if (live.length === 0) return null;
  const drafted = summarizeTablesInDoc(markdownToDoc(args.markdown));
  if (drafted.length === 0) return null;
  for (let i = 0; i < Math.min(live.length, drafted.length); i++) {
    const expected = live[i]!.headers;
    const next = drafted[i]!.headers;
    if (headersEqual(expected, next)) continue;
    return (
      `This field's live table ${i} headers are ${formatLiveHeaders(expected)}. ` +
      `Call read_section and copy fields[].tables[].headers exactly — do not substitute another document type's columns (got ${formatLiveHeaders(next)}).`
    );
  }
  return null;
}
