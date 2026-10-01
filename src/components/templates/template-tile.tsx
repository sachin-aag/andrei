"use client";

import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  BarChart2,
  BookCheck,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  FileCheck,
  FileCheck2,
  FileCog,
  FileSearch,
  FileText,
  FlaskConical,
  GitBranch,
  Grid3X3,
  LayoutDashboard,
  ListChecks,
  MonitorCheck,
  RefreshCcw,
  Shield,
  Stethoscope,
  Wrench,
} from "lucide-react";
import type { DemoDocumentTemplate } from "@/lib/document-templates";
import { cn } from "@/lib/utils";

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  "vendor-qualification": Shield,
  "user-requirements": ClipboardList,
  "design-specs": FileText,
  "cad-models": Grid3X3,
  dfmea: AlertTriangle,
  "design-test-methods": FlaskConical,
  "test-method-validation": FileCheck2,
  "design-verification": FileSearch,
  "design-validation": Stethoscope,
  "process-flow-diagram": GitBranch,
  "tools-fixtures-equipment": Wrench,
  "equipment-qualification-plan": ClipboardCheck,
  "equipment-qualification-report": FileCheck,
  "graphic-operator-interface": LayoutDashboard,
  "process-characterisation": BarChart2,
  "process-test-method": FlaskConical,
  "tmv-plan-report": FileCog,
  "process-validation-plan-report": CheckSquare,
  "master-validation-plan-report": BookCheck,
  "design-transfer": ArrowRightLeft,
  pfmea: AlertCircle,
  capa: RefreshCcw,
  deviations: ListChecks,
  "change-control": MonitorCheck,
  "blank-document": FileText,
};

const FallbackIcon = CheckCircle2;

export function TemplateTile({
  template,
  onSelect,
}: {
  template: DemoDocumentTemplate;
  onSelect: (template: DemoDocumentTemplate) => void;
}) {
  const Icon = TEMPLATE_ICONS[template.id] ?? FallbackIcon;

  return (
    <button
      type="button"
      aria-label={template.title}
      onClick={() => onSelect(template)}
      className={cn(
        "group flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-5 text-center transition-colors",
        "hover:border-[var(--brand-500)] hover:bg-[var(--secondary)]",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      )}
    >
      <Icon
        className="size-7 shrink-0 text-[var(--foreground)] opacity-75 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
        strokeWidth={1.5}
      />
      <span className="text-[13px] font-medium leading-snug text-[var(--foreground)]">
        {template.title}
      </span>
    </button>
  );
}
