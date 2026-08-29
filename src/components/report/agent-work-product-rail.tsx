"use client";

import { BarChart3, FileText, History, Paperclip, PanelRightOpen } from "lucide-react";
import type { WorkProductView } from "./workspace-chrome";
import {
  attachmentIdFromTab,
  canvasTabKind,
  type CanvasTabId,
} from "./work-product-canvas";

/** Collapsed right-hand work-product strip in Agent chrome. Expand + last active tab. */
export function AgentWorkProductRail({
  activeTabId,
  statsEnabled,
  attachmentLabel,
  onSelectView,
  onExpand,
}: {
  activeTabId: CanvasTabId;
  statsEnabled: boolean;
  attachmentLabel?: string;
  onSelectView: (view: WorkProductView) => void;
  onExpand: () => void;
}) {
  const kind = canvasTabKind(activeTabId);
  const attachmentId = attachmentIdFromTab(activeTabId);
  const pinned: WorkProductView =
    kind === "analytics" && statsEnabled ? "analytics" : "report";

  const { label, testId, icon: ActiveIcon, onClick } = ((): {
    label: string;
    testId: string;
    icon: typeof FileText;
    onClick: () => void;
  } => {
    switch (kind) {
      case "analytics": {
        if (!statsEnabled) {
          return {
            label: "Report",
            testId: "report-surface-document",
            icon: FileText,
            onClick: () => {
              onSelectView("report");
              onExpand();
            },
          };
        }
        return {
          label: "Analytics",
          testId: "report-surface-analytics",
          icon: BarChart3,
          onClick: () => {
            onSelectView("analytics");
            onExpand();
          },
        };
      }
      case "attachment":
        return {
          label: attachmentLabel ?? "Attachment",
          testId: attachmentId
            ? `work-product-tab-attachment-${attachmentId}`
            : "work-product-tab-attachment",
          icon: Paperclip,
          onClick: onExpand,
        };
      case "history":
        return {
          label: "Compare",
          testId: "work-product-tab-history",
          icon: History,
          onClick: onExpand,
        };
      case "report":
        return {
          label: "Report",
          testId: "report-surface-document",
          icon: FileText,
          onClick: () => {
            onSelectView(pinned);
            onExpand();
          },
        };
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  })();

  return (
    <div className="flex h-full w-full min-w-0 flex-col items-center bg-[var(--card)] py-2">
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand document panel"
        aria-expanded={false}
        className="flex size-9 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
        title="Expand"
      >
        <PanelRightOpen className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        aria-label={label}
        aria-pressed
        title={label}
        className="relative mt-1 flex size-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      >
        <ActiveIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
