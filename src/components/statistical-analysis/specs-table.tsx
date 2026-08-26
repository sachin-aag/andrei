"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorksheetSpecRow } from "@/lib/statistical-analysis/types";

export function SpecsTable({
  specs,
  readOnly,
  onChange,
}: {
  specs: WorksheetSpecRow[];
  readOnly: boolean;
  onChange: (specs: WorksheetSpecRow[]) => void;
}) {
  const rows =
    specs.length > 0
      ? specs
      : [{ columnName: "", lsl: "", usl: "", target: "" }];

  const update = (index: number, patch: Partial<WorksheetSpecRow>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  };

  return (
    <div data-testid="worksheet-specs" className="h-full overflow-auto p-4">
      <p className="mb-3 max-w-xl text-sm text-[var(--muted-foreground)]">
        Spec limits for worksheet columns. Extraction fills these when the
        attachments include LSL/USL. The sixpack form uses this tab first,
        then the min and max of the selected data.
      </p>
      <table className="w-full max-w-2xl border-collapse text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
            <th className="border-b border-[var(--border)] px-2 py-1.5 font-medium">
              Column
            </th>
            <th className="border-b border-[var(--border)] px-2 py-1.5 font-medium">
              LSL
            </th>
            <th className="border-b border-[var(--border)] px-2 py-1.5 font-medium">
              USL
            </th>
            <th className="border-b border-[var(--border)] px-2 py-1.5 font-medium">
              Target
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.columnName}-${index}`}>
              <td className="px-2 py-1">
                <Input
                  data-testid={`spec-column-${index}`}
                  value={row.columnName}
                  disabled={readOnly}
                  onChange={(event) =>
                    update(index, { columnName: event.target.value })
                  }
                />
              </td>
              <td className="px-2 py-1">
                <Input
                  data-testid={`spec-lsl-${index}`}
                  value={row.lsl}
                  disabled={readOnly}
                  onChange={(event) => update(index, { lsl: event.target.value })}
                />
              </td>
              <td className="px-2 py-1">
                <Input
                  data-testid={`spec-usl-${index}`}
                  value={row.usl}
                  disabled={readOnly}
                  onChange={(event) => update(index, { usl: event.target.value })}
                />
              </td>
              <td className="px-2 py-1">
                <Input
                  data-testid={`spec-target-${index}`}
                  value={row.target}
                  disabled={readOnly}
                  onChange={(event) =>
                    update(index, { target: event.target.value })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {readOnly ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          data-testid="add-spec-row"
          onClick={() =>
            onChange([...rows, { columnName: "", lsl: "", usl: "", target: "" }])
          }
        >
          Add row
        </Button>
      )}
    </div>
  );
}
