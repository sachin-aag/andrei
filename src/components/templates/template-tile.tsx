"use client";

import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowRightLeft,
  BarChart2,
  BookCheck,
  Building2,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  FileCheck,
  FileCheck2,
  FileCog,
  FileSearch,
  FileSignature,
  FileStack,
  FileText,
  FlaskConical,
  FolderSync,
  GitBranch,
  GitPullRequest,
  Layers,
  LayoutDashboard,
  ListChecks,
  MonitorCheck,
  Package,
  RefreshCcw,
  Shield,
  ShieldAlert,
  Stethoscope,
  Wrench,
} from "lucide-react";
import { TemplateReadyBadge } from "@/components/templates/ready-badge";
import {
  isDemoTemplateExportReady,
  type DemoDocumentTemplate,
} from "@/lib/document-templates";
import { cn } from "@/lib/utils";

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  "supplier-control-procedure": BookCheck,
  "supplier-risk-classification": AlertTriangle,
  "approved-supplier-list": ListChecks,
  "vendor-qualification": Shield,
  "vendor-qualification-report": FileCheck,
  "supplier-audit-report": FileSearch,
  "quality-agreement": FileText,
  "purchase-order-purchasing-data": ClipboardList,
  "incoming-inspection-coc-coa": CheckSquare,
  "supplier-corrective-action-request": AlertCircle,
  "user-requirements": ClipboardList,
  "design-specs": FileText,
  dfmea: AlertTriangle,
  "design-test-methods": FlaskConical,
  "test-method-validation": FileCheck2,
  "design-verification": FileSearch,
  "design-validation": Stethoscope,
  "process-flow-diagram": GitBranch,
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
  "document-template-transfer": FileStack,
  "dhf-dmr-transfer": FolderSync,
  "risk-file-transfer": ShieldAlert,
  "eco-migration": GitPullRequest,
  "supplier-vendor-transfer": Building2,
  "quality-agreement-transfer": FileSignature,
  "equipment-qualification-transfer": Wrench,
  "process-test-method-transfer": Layers,
  "part-bom-migration": Package,
  "complaint-capa-migration": AlertOctagon,
  "blank-document": FileText,
};

const FallbackIcon = FileText;

export function TemplateTile({
  template,
  onSelect,
}: {
  template: DemoDocumentTemplate;
  onSelect: (template: DemoDocumentTemplate) => void;
}) {
  const Icon = TEMPLATE_ICONS[template.id] ?? FallbackIcon;
  const ready = isDemoTemplateExportReady(template);

  return (
    <button
      type="button"
      aria-label={template.title}
      onClick={() => onSelect(template)}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-5 text-center transition-colors",
        "hover:border-[var(--brand-500)] hover:bg-[var(--secondary)]",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      )}
    >
      {ready ? (
        <TemplateReadyBadge className="absolute right-2 top-2" />
      ) : null}
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
