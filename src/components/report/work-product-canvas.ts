import type { WorkProductView } from "./workspace-chrome";

export type CanvasTabId =
  | "report"
  | "analytics"
  | `attachment:${string}`
  | "history";

export type CanvasTabKind = WorkProductView | "attachment" | "history";

export type CanvasTabListItem = {
  id: CanvasTabId;
  label: string;
  testId: string;
  closable: boolean;
  closeAriaLabel?: string;
};

export function attachmentTabId(attachmentId: string): CanvasTabId {
  return `attachment:${attachmentId}`;
}

export function attachmentIdFromTab(id: CanvasTabId): string | null {
  if (!id.startsWith("attachment:")) return null;
  return id.slice("attachment:".length);
}

export function canvasTabKind(id: CanvasTabId): CanvasTabKind {
  switch (id) {
    case "report":
      return "report";
    case "analytics":
      return "analytics";
    case "history":
      return "history";
    default:
      return "attachment";
  }
}

export function ensureAttachmentOpen(
  openIds: readonly string[],
  attachmentId: string
): string[] {
  if (openIds.includes(attachmentId)) return openIds as string[];
  return [...openIds, attachmentId];
}

export function removeAttachmentOpen(
  openIds: readonly string[],
  attachmentId: string
): string[] {
  return openIds.filter((id) => id !== attachmentId);
}

export function pruneOpenAttachments(
  openIds: readonly string[],
  liveIds: ReadonlySet<string>
): string[] {
  return openIds.filter((id) => liveIds.has(id));
}

export const CANVAS_TAB_RECENTS_CAP = 8;

/** Move `visited` to the end (most recent). Drops older entries past the cap. */
export function rememberCanvasTabVisit(
  recents: readonly CanvasTabId[],
  visited: CanvasTabId
): CanvasTabId[] {
  const next = recents.filter((id) => id !== visited);
  next.push(visited);
  return next.length > CANVAS_TAB_RECENTS_CAP
    ? next.slice(-CANVAS_TAB_RECENTS_CAP)
    : next;
}

/**
 * After closing a canvas tab, restore the most recently visited tab that is
 * still open. Closing a background tab leaves the current tab selected.
 */
export function tabIdAfterClosing(args: {
  closedId: CanvasTabId;
  currentlyActive: CanvasTabId;
  recents: readonly CanvasTabId[];
  remainingTabIds: readonly CanvasTabId[];
}): CanvasTabId {
  if (args.currentlyActive !== args.closedId) {
    return args.currentlyActive;
  }
  const remaining = new Set(args.remainingTabIds);
  for (let i = args.recents.length - 1; i >= 0; i--) {
    const id = args.recents[i];
    if (id !== args.closedId && remaining.has(id)) {
      return id;
    }
  }
  return "report";
}

export function buildCanvasTabs(args: {
  statsEnabled: boolean;
  openAttachmentIds: readonly string[];
  attachmentLabels: Readonly<Record<string, string>>;
  compare: { from: number; to: number } | null;
}): CanvasTabListItem[] {
  const tabs: CanvasTabListItem[] = [
    {
      id: "report",
      label: "Report",
      testId: "report-surface-document",
      closable: false,
    },
  ];
  if (args.statsEnabled) {
    tabs.push({
      id: "analytics",
      label: "Analytics",
      testId: "report-surface-analytics",
      closable: false,
    });
  }
  for (const attachmentId of args.openAttachmentIds) {
    const label = args.attachmentLabels[attachmentId] ?? "Attachment";
    tabs.push({
      id: attachmentTabId(attachmentId),
      label,
      testId: `work-product-tab-attachment-${attachmentId}`,
      closable: true,
      closeAriaLabel: `Close ${label}`,
    });
  }
  if (args.compare) {
    tabs.push({
      id: "history",
      label: `Compare ${args.compare.from} → ${args.compare.to}`,
      testId: "work-product-tab-history",
      closable: true,
      closeAriaLabel: "Close compare",
    });
  }
  return tabs;
}
