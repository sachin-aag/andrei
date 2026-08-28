"use client";

import type { ReactNode } from "react";
import {
  BarChart3,
  ChartScatter,
  FileSearch,
  LayoutList,
  LineChart,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AnalyticsChatToolInfo = {
  toolName: string;
  state: string;
  input: Record<string, unknown> | undefined;
  output: Record<string, unknown> | undefined;
  errorText: string | undefined;
};

function ToolLine({
  icon,
  tone = "muted",
  children,
}: {
  icon: ReactNode;
  tone?: "muted" | "success" | "warn";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
        tone === "success" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
        tone === "warn" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700",
        tone === "muted" &&
          "border-[var(--border)] bg-[var(--secondary)]/40 text-[var(--muted-foreground)]"
      )}
    >
      {icon}
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function writeColumnNamesFromTool(info: AnalyticsChatToolInfo): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const name = raw.trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };
  if (Array.isArray(info.input?.columns)) {
    for (const column of info.input.columns) {
      if (!column || typeof column !== "object" || Array.isArray(column)) {
        continue;
      }
      push((column as { name?: unknown }).name);
    }
  }
  push(info.input?.name);
  if (Array.isArray(info.output?.columns)) {
    for (const column of info.output.columns) {
      if (!column || typeof column !== "object" || Array.isArray(column)) {
        continue;
      }
      push((column as { columnName?: unknown }).columnName);
    }
  }
  push(info.output?.columnName);
  return names;
}

function manageWorksheetPendingLabel(action: string): string {
  switch (action) {
    case "add_sheet":
      return "Adding data sheet…";
    case "rename_sheet":
      return "Renaming sheet…";
    case "delete_sheet":
      return "Deleting sheet…";
    case "add_column":
      return "Adding column…";
    case "rename_column":
      return "Renaming column…";
    case "delete_column":
      return "Deleting column…";
    case "add_row":
      return "Adding row…";
    case "delete_row":
      return "Deleting row…";
    case "set_cell":
      return "Updating cell…";
    default:
      return "Updating worksheet…";
  }
}

export function isAnalyticsWorksheetMutationTool(toolName: string): boolean {
  return toolName === "write_column" || toolName === "manage_worksheet";
}

/** Returns null when the tool is not an analytics chip (report ToolChip handles it). */
export function AnalyticsChatToolChip({
  info,
}: {
  info: AnalyticsChatToolInfo;
}): ReactNode {
  const pending =
    info.state === "input-streaming" || info.state === "input-available";

  switch (info.toolName) {
    case "search_documents":
      return (
        <ToolLine icon={<FileSearch className="size-3.5" />}>
          {pending ? "Searching attachments…" : "Searched attachments"}
        </ToolLine>
      );
    case "read_document_page": {
      const page =
        typeof info.input?.pageNumber === "number"
          ? ` p.${info.input.pageNumber}`
          : "";
      return (
        <ToolLine icon={<FileSearch className="size-3.5" />}>
          {pending ? "Reading page…" : `Read page${page}`}
        </ToolLine>
      );
    }
    case "document_outline":
      return (
        <ToolLine icon={<LayoutList className="size-3.5" />}>
          {pending ? "Reading outline…" : "Read document outline"}
        </ToolLine>
      );
    case "scan_attachments":
      return (
        <ToolLine icon={<FileSearch className="size-3.5" />}>
          {pending ? "Scanning attachments…" : "Scanned attachments"}
        </ToolLine>
      );
    case "read_worksheet":
      return (
        <ToolLine icon={<Table2 className="size-3.5" />}>
          {pending ? "Reading worksheet…" : "Read worksheet"}
        </ToolLine>
      );
    case "extract_numeric_series": {
      const count =
        typeof info.output?.valueCount === "number"
          ? info.output.valueCount
          : null;
      if (pending) {
        return (
          <ToolLine icon={<Table2 className="size-3.5" />}>
            Extracting numbers…
          </ToolLine>
        );
      }
      return (
        <ToolLine
          icon={<Table2 className="size-3.5" />}
          tone={count && count > 0 ? "success" : "warn"}
        >
          {count && count > 0
            ? `Extracted ${count} value${count === 1 ? "" : "s"}`
            : info.output?.status === "ambiguous"
              ? typeof info.output?.message === "string"
                ? info.output.message
                : "Need one measurement series"
              : "No numbers found"}
        </ToolLine>
      );
    }
    case "write_column": {
      const columnNames = writeColumnNamesFromTool(info);
      if (pending) {
        return (
          <ToolLine icon={<Table2 className="size-3.5" />}>
            {columnNames.length > 1 ? "Writing columns…" : "Writing column…"}
          </ToolLine>
        );
      }
      if (info.output?.status === "written") {
        const name =
          columnNames.length > 0 ? columnNames.join(", ") : "column";
        return (
          <ToolLine
            icon={<Table2 className="size-3.5 text-emerald-500" />}
            tone="success"
          >
            Wrote {name} — check the worksheet
          </ToolLine>
        );
      }
      return (
        <ToolLine icon={<Table2 className="size-3.5" />} tone="warn">
          {typeof info.output?.message === "string"
            ? info.output.message
            : "Could not write the column."}
        </ToolLine>
      );
    }
    case "manage_worksheet": {
      const action =
        typeof info.input?.action === "string" ? info.input.action : "";
      if (pending) {
        return (
          <ToolLine icon={<Table2 className="size-3.5" />}>
            {manageWorksheetPendingLabel(action)}
          </ToolLine>
        );
      }
      if (info.output?.status === "ok") {
        return (
          <ToolLine
            icon={<Table2 className="size-3.5 text-emerald-500" />}
            tone="success"
          >
            {typeof info.output.message === "string"
              ? info.output.message
              : "Updated the worksheet"}
          </ToolLine>
        );
      }
      return (
        <ToolLine icon={<Table2 className="size-3.5" />} tone="warn">
          {typeof info.output?.message === "string"
            ? info.output.message
            : "Could not update the worksheet."}
        </ToolLine>
      );
    }
    case "run_capability_sixpack": {
      if (pending) {
        return (
          <ToolLine icon={<LineChart className="size-3.5" />}>
            Running sixpack…
          </ToolLine>
        );
      }
      if (info.output?.status === "ok") {
        return (
          <ToolLine
            icon={<LineChart className="size-3.5 text-emerald-500" />}
            tone="success"
          >
            Saved sixpack — open the Results tab
          </ToolLine>
        );
      }
      return (
        <ToolLine icon={<LineChart className="size-3.5" />} tone="warn">
          {typeof info.output?.message === "string"
            ? info.output.message
            : "Could not run the sixpack."}
        </ToolLine>
      );
    }
    case "run_one_way_anova": {
      if (pending) {
        return (
          <ToolLine icon={<BarChart3 className="size-3.5" />}>
            Running one-way ANOVA…
          </ToolLine>
        );
      }
      if (info.output?.status === "ok") {
        return (
          <ToolLine
            icon={<BarChart3 className="size-3.5 text-emerald-500" />}
            tone="success"
          >
            Saved one-way ANOVA — open the Results tab
          </ToolLine>
        );
      }
      return (
        <ToolLine icon={<BarChart3 className="size-3.5" />} tone="warn">
          {typeof info.output?.message === "string"
            ? info.output.message
            : "Could not run the ANOVA."}
        </ToolLine>
      );
    }
    case "plot_xy_scatter": {
      if (pending) {
        return (
          <ToolLine icon={<ChartScatter className="size-3.5" />}>
            Plotting XY scatter…
          </ToolLine>
        );
      }
      if (info.output?.status === "ok") {
        return (
          <ToolLine
            icon={<ChartScatter className="size-3.5 text-emerald-500" />}
            tone="success"
          >
            Saved XY scatter — open the Results tab
          </ToolLine>
        );
      }
      return (
        <ToolLine icon={<ChartScatter className="size-3.5" />} tone="warn">
          {typeof info.output?.message === "string"
            ? info.output.message
            : "Could not plot the scatter."}
        </ToolLine>
      );
    }
    case "plot_measurements": {
      if (pending) {
        return (
          <ToolLine icon={<ChartScatter className="size-3.5" />}>
            Plotting measurements…
          </ToolLine>
        );
      }
      if (info.output?.status === "ok") {
        return (
          <ToolLine
            icon={<ChartScatter className="size-3.5 text-emerald-500" />}
            tone="success"
          >
            Saved scatter — open the Results tab
          </ToolLine>
        );
      }
      return (
        <ToolLine icon={<ChartScatter className="size-3.5" />} tone="warn">
          {typeof info.output?.message === "string"
            ? info.output.message
            : "Could not plot measurements."}
        </ToolLine>
      );
    }
    default:
      return null;
  }
}
