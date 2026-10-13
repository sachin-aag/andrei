"use client";

import {
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { ATTACHMENT_TAB_DRAG_MIME } from "./attachment-tab-drag";
import {
  anchorPane,
  canSplitPane,
  findPane,
  isAnchorPane,
  listPanes,
  SPLIT_RATIO_MAX,
  SPLIT_RATIO_MIN,
  type CanvasLayout,
  type LayoutNode,
  type PaneLeaf,
  type SplitDirection,
  type SplitNode,
} from "./canvas-layout";
import {
  buildCanvasTabs,
  type CanvasTabId,
  type CanvasTabListItem,
} from "./work-product-canvas";
import { WorkProductTabs } from "./work-product-tabs";

const SPLIT_DIRECTIONS: { id: SplitDirection; label: string }[] = [
  { id: "left", label: "Split left" },
  { id: "right", label: "Split right" },
  { id: "up", label: "Split up" },
  { id: "down", label: "Split down" },
];

function dragHasAttachment(event: DragEvent | { dataTransfer: DataTransfer }) {
  return event.dataTransfer.types.includes(ATTACHMENT_TAB_DRAG_MIME);
}

function subtreeContains(node: LayoutNode, paneId: string): boolean {
  if (node.kind === "pane") return node.id === paneId;
  return (
    subtreeContains(node.first, paneId) || subtreeContains(node.second, paneId)
  );
}

function SplitSash({
  node,
  onRatio,
  hidden = false,
}: {
  node: SplitNode;
  onRatio: (splitId: string, ratio: number) => void;
  hidden?: boolean;
}) {
  const axis = node.axis;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const parent = handle.parentElement;
    if (!parent) return;
    const pointerId = event.pointerId;
    const origin = axis === "x" ? event.clientX : event.clientY;
    const span =
      axis === "x" ? parent.getBoundingClientRect().width : parent.getBoundingClientRect().height;
    const originRatio = node.ratio;
    handle.setPointerCapture(pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const current = axis === "x" ? moveEvent.clientX : moveEvent.clientY;
      const next = originRatio + (current - origin) / Math.max(span, 1);
      onRatio(node.id, Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, next)));
    };
    const stop = () => {
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
    };
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };

  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={axis === "x" ? "Resize split columns" : "Resize split rows"}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : 0}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.1 : 0.05;
        const delta =
          event.key === "ArrowRight" || event.key === "ArrowDown"
            ? step
            : event.key === "ArrowLeft" || event.key === "ArrowUp"
              ? -step
              : 0;
        if (delta === 0) return;
        event.preventDefault();
        onRatio(
          node.id,
          Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, node.ratio + delta))
        );
      }}
      onDoubleClick={() => onRatio(node.id, 0.5)}
      className={cn(
        "z-20 shrink-0 bg-[var(--border)] hover:bg-[var(--brand-600)] focus-visible:bg-[var(--brand-600)] focus-visible:outline-none",
        axis === "x"
          ? "w-1 cursor-col-resize"
          : "h-1 cursor-row-resize",
        hidden && "hidden"
      )}
    />
  );
}

export function CanvasSplitView({
  layout,
  presentation,
  statsEnabled,
  attachmentLabels,
  compare,
  onFocusPane,
  onSelectTab,
  onCloseTab,
  onCloseOthers,
  onSplit,
  onDropAttachment,
  onRatio,
  renderLeading,
  renderToolbar,
  renderBody,
}: {
  layout: CanvasLayout;
  presentation: "grid" | "single";
  statsEnabled: boolean;
  attachmentLabels: Readonly<Record<string, string>>;
  compare: { from: number; to: number } | null;
  onFocusPane: (paneId: string) => void;
  onSelectTab: (paneId: string, tabId: CanvasTabId) => void;
  onCloseTab: (paneId: string, tabId: CanvasTabId) => void;
  onCloseOthers: (paneId: string, tabId: CanvasTabId) => void;
  onSplit: (paneId: string, direction: SplitDirection, tabId: CanvasTabId) => void;
  onDropAttachment: (paneId: string, attachmentId: string) => void;
  onRatio: (splitId: string, ratio: number) => void;
  renderLeading?: (pane: PaneLeaf) => ReactNode;
  renderToolbar?: (pane: PaneLeaf) => ReactNode;
  renderBody: (pane: PaneLeaf) => ReactNode;
}) {
  const [dropPaneId, setDropPaneId] = useState<string | null>(null);
  const focused =
    findPane(layout.root, layout.focusedPaneId) ?? anchorPane(layout.root);
  const multiple = listPanes(layout.root).length > 1;

  const renderPane = (pane: PaneLeaf, menu: boolean) => {
    const anchor = isAnchorPane(layout.root, pane.id);
    const tabs = buildCanvasTabs({
      statsEnabled,
      tabIds: pane.tabIds,
      attachmentLabels,
      compare,
      pinned: anchor,
      testIdScope: anchor ? undefined : pane.id,
    });
    const focusedPane = pane.id === focused.id;
    return (
      <div
        data-testid={`canvas-pane-${pane.id}`}
        data-pane-focused={focusedPane ? "true" : "false"}
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          multiple &&
            focusedPane &&
            presentation === "grid" &&
            "ring-1 ring-inset ring-[var(--brand-600)]",
          dropPaneId === pane.id && "bg-[var(--secondary)]"
        )}
        onPointerDown={() => onFocusPane(pane.id)}
        onDragOver={(event) => {
          if (!dragHasAttachment(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          if (dropPaneId !== pane.id) setDropPaneId(pane.id);
        }}
        onDragLeave={() => {
          if (dropPaneId === pane.id) setDropPaneId(null);
        }}
        onDrop={(event) => {
          if (!dragHasAttachment(event)) return;
          const attachmentId = event.dataTransfer.getData(ATTACHMENT_TAB_DRAG_MIME);
          event.preventDefault();
          setDropPaneId(null);
          if (attachmentId) onDropAttachment(pane.id, attachmentId);
        }}
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3",
            presentation === "single" && pane.id !== focused.id && "hidden"
          )}
        >
          {presentation === "single" && renderLeading
            ? renderLeading(pane)
            : null}
          <WorkProductTabs
            tabs={tabs}
            value={pane.activeTabId}
            onChange={(tabId) => onSelectTab(pane.id, tabId)}
            onClose={(tabId) => onCloseTab(pane.id, tabId)}
            stripTestId={
              anchor ? undefined : `work-product-tab-strip-${pane.id}`
            }
            menuFor={
              menu
                ? (tab) => (
                    <PaneTabMenu
                      layout={layout}
                      pane={pane}
                      tab={tab}
                      statsEnabled={statsEnabled}
                      onCloseTab={onCloseTab}
                      onCloseOthers={onCloseOthers}
                      onSplit={onSplit}
                    />
                  )
                : undefined
            }
          />
          {renderToolbar ? (
            <div className="ml-auto flex shrink-0 items-center gap-2 py-2">
              {renderToolbar(pane)}
            </div>
          ) : null}
        </div>
        <div
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
          data-canvas-pane-body={pane.id}
        >
          {renderBody(pane)}
        </div>
      </div>
    );
  };

  const renderNode = (node: LayoutNode): ReactNode => {
    if (node.kind === "pane") {
      return renderPane(node, presentation === "grid");
    }
    const hideFirst =
      presentation === "single" && !subtreeContains(node.first, focused.id);
    const hideSecond =
      presentation === "single" && !subtreeContains(node.second, focused.id);
    return (
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1",
          node.axis === "x" ? "flex-row" : "flex-col"
        )}
      >
        <div
          className={cn(
            "flex min-h-0 min-w-0",
            presentation === "single" && "flex-1",
            hideFirst && "hidden"
          )}
          style={
            presentation === "grid"
              ? node.axis === "x"
                ? { width: `${node.ratio * 100}%` }
                : { height: `${node.ratio * 100}%` }
              : undefined
          }
        >
          {renderNode(node.first)}
        </div>
        <SplitSash
          node={node}
          onRatio={onRatio}
          hidden={presentation === "single"}
        />
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1",
            hideSecond && "hidden"
          )}
        >
          {renderNode(node.second)}
        </div>
      </div>
    );
  };

  return renderNode(layout.root);
}

function PaneTabMenu({
  layout,
  pane,
  tab,
  statsEnabled,
  onCloseTab,
  onCloseOthers,
  onSplit,
}: {
  layout: CanvasLayout;
  pane: PaneLeaf;
  tab: CanvasTabListItem;
  statsEnabled: boolean;
  onCloseTab: (paneId: string, tabId: CanvasTabId) => void;
  onCloseOthers: (paneId: string, tabId: CanvasTabId) => void;
  onSplit: (paneId: string, direction: SplitDirection, tabId: CanvasTabId) => void;
}) {
  const anchor = isAnchorPane(layout.root, pane.id);
  const others = pane.tabIds.some((id) => {
    if (id === tab.id) return false;
    if (anchor && (id === "report" || (id === "analytics" && statsEnabled))) {
      return false;
    }
    return true;
  });
  return (
    <>
      <ContextMenuItem
        disabled={!tab.closable}
        onSelect={() => onCloseTab(pane.id, tab.id)}
      >
        Close
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!others}
        onSelect={() => onCloseOthers(pane.id, tab.id)}
      >
        Close others
      </ContextMenuItem>
      <ContextMenuSeparator />
      {SPLIT_DIRECTIONS.map((direction) => (
        <ContextMenuItem
          key={direction.id}
          disabled={
            !canSplitPane(layout, pane.id, direction.id, tab.id, statsEnabled)
          }
          onSelect={() => onSplit(pane.id, direction.id, tab.id)}
        >
          {direction.label}
        </ContextMenuItem>
      ))}
    </>
  );
}
