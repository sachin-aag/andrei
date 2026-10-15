"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  BookOpen,
  ChevronLeft,
  Eye,
  FileText,
  FlaskConical,
  GitBranch,
  LayoutGrid,
  List,
  PenLine,
  Shield,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FindingSeverity } from "@/lib/review-mockup/sample-data";
import { Button } from "@/components/ui/button";

export function SeverityBadge({
  severity,
  size = "sm",
}: {
  severity: FindingSeverity;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded font-semibold uppercase tracking-wide",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        severity === "critical" && "bg-red-600 text-white",
        severity === "major" && "bg-amber-500 text-white",
        severity === "minor" && "bg-sky-700 text-white"
      )}
    >
      {severity}
    </span>
  );
}

export function SeverityCount({
  severity,
  count,
}: {
  severity: FindingSeverity;
  count: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        severity === "critical" && "bg-red-600/10 text-red-700",
        severity === "major" && "bg-amber-500/15 text-amber-800",
        severity === "minor" && "bg-sky-600/10 text-sky-800"
      )}
    >
      <span className="font-semibold">{count}</span>
      {severity}
    </span>
  );
}

export function MockupIcon({
  name,
  className,
}: {
  name:
    | "file"
    | "pen"
    | "list"
    | "git"
    | "book"
    | "eye"
    | "flask"
    | "grid"
    | "table"
    | "shield";
  className?: string;
}) {
  const Icon: LucideIcon = {
    file: FileText,
    pen: PenLine,
    list: List,
    git: GitBranch,
    book: BookOpen,
    eye: Eye,
    flask: FlaskConical,
    grid: LayoutGrid,
    table: Table2,
    shield: Shield,
  }[name];
  return <Icon className={cn("size-4 shrink-0", className)} aria-hidden="true" />;
}

export function BackRow({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
    >
      <ChevronLeft className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

export function MetaTable({
  rows,
}: {
  rows: { label: string; value: string }[];
}) {
  return (
    <dl className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60 px-3 py-2 text-xs">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[72px_1fr] gap-2 py-0.5">
          <dt className="text-[var(--muted-foreground)]">{row.label}</dt>
          <dd className="font-medium text-[var(--foreground)]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FindingCard({
  severity,
  title,
  location,
  body,
  suggestedReplacement,
  applied,
  onShow,
  onApply,
}: {
  severity: FindingSeverity;
  title: string;
  location: string;
  body: string;
  suggestedReplacement?: string;
  applied?: boolean;
  onShow: () => void;
  onApply?: () => void;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border bg-[var(--card)] p-3 shadow-sm",
        severity === "critical" && "border-l-4 border-l-red-600 border-y-[var(--border)] border-r-[var(--border)]",
        severity === "major" && "border-l-4 border-l-amber-500 border-y-[var(--border)] border-r-[var(--border)]",
        severity === "minor" && "border-l-4 border-l-sky-700 border-y-[var(--border)] border-r-[var(--border)]"
      )}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <SeverityBadge severity={severity} />
        <span className="text-[10px] text-[var(--muted-foreground)]">{location}</span>
      </div>
      <h3 className="text-sm font-semibold leading-snug">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
        {body}
      </p>
      {suggestedReplacement ? (
        <div className="mt-2 rounded-md border border-emerald-700/20 bg-emerald-700/10 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
            Suggested replacement
          </p>
          <p className="mt-0.5 text-xs text-emerald-950">{suggestedReplacement}</p>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onShow}>
          Show in document
        </Button>
        {onApply ? (
          <Button
            type="button"
            size="sm"
            onClick={onApply}
            disabled={applied}
          >
            {applied ? "Applied as tracked change" : "Apply as tracked change"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function SelectableCard({
  title,
  description,
  icon,
  badges,
  onClick,
  testId,
}: {
  title: string;
  description: string;
  icon: Parameters<typeof MockupIcon>[0]["name"];
  badges?: ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-left shadow-sm transition-colors hover:border-[var(--brand-400)] hover:bg-[var(--secondary)]/40"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-8 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--brand-700)]">
          <MockupIcon name={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
            {description}
          </p>
          {badges ? <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div> : null}
        </div>
      </div>
    </button>
  );
}
