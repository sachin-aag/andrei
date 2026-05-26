import type { JSONContent } from "@tiptap/core";
import { cn } from "@/lib/utils";

function cellPlainText(cell: JSONContent): string {
  const parts: string[] = [];
  for (const block of cell.content ?? []) {
    if (block.type !== "paragraph") continue;
    for (const inline of block.content ?? []) {
      if (inline.type === "text" && inline.text) {
        parts.push(inline.text);
      }
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

type SignatureApprovalsTableProps = {
  table: JSONContent;
  className?: string;
};

/** Read-only sign-off table — avoids TipTap editor padding and trailing empty blocks. */
export function SignatureApprovalsTable({ table, className }: SignatureApprovalsTableProps) {
  const rows = table.type === "table" ? (table.content ?? []) : [];
  if (rows.length === 0) return null;

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm leading-relaxed",
        className
      )}
    >
      <table className="w-full border-collapse table-fixed">
        <tbody>
          {rows.map((row, rowIndex) => {
            if (row.type !== "tableRow") return null;
            const cells = row.content ?? [];
            return (
              <tr key={rowIndex}>
                {cells.map((cell, cellIndex) => {
                  const isHeader = cell.type === "tableHeader";
                  const Tag = isHeader ? "th" : "td";
                  const colspan = (cell.attrs as { colspan?: number } | undefined)?.colspan;
                  const text = cellPlainText(cell);
                  return (
                    <Tag
                      key={cellIndex}
                      colSpan={colspan && colspan > 1 ? colspan : undefined}
                      className={cn(
                        "border border-[var(--border)] px-2 py-1.5 align-top",
                        isHeader && "bg-[var(--secondary)] font-semibold"
                      )}
                    >
                      {text || "\u00a0"}
                    </Tag>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
