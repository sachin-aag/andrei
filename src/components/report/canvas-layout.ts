import {
  attachmentTabId,
  tabIdAfterClosing,
  type CanvasTabId,
} from "./work-product-canvas";

/**
 * The pane that occupies the top-left cell. The live report editor stays
 * here. Report and Analytics stay pinned as tabs; a Report copy in another
 * pane is view-only. The live worksheet follows the pane where Analytics
 * is in front.
 */
export const ANCHOR_PANE_ID = "anchor";

export const SPLIT_RATIO_MIN = 0.2;
export const SPLIT_RATIO_MAX = 0.8;
export const SPLIT_RATIO_DEFAULT = 0.5;

export type SplitAxis = "x" | "y";
export type SplitDirection = "left" | "right" | "up" | "down";

export type PaneLeaf = {
  kind: "pane";
  id: string;
  tabIds: CanvasTabId[];
  activeTabId: CanvasTabId;
  recents: CanvasTabId[];
};

export type SplitNode = {
  kind: "split";
  id: string;
  axis: SplitAxis;
  /** Fraction of the parent given to the first child. */
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
};

export type LayoutNode = PaneLeaf | SplitNode;

export type CanvasLayout = {
  root: LayoutNode;
  focusedPaneId: string;
  nextNumber: number;
};

export function createCanvasLayout(statsEnabled: boolean): CanvasLayout {
  const tabIds: CanvasTabId[] = statsEnabled
    ? ["report", "analytics"]
    : ["report"];
  return {
    root: {
      kind: "pane",
      id: ANCHOR_PANE_ID,
      tabIds,
      activeTabId: "report",
      recents: ["report"],
    },
    focusedPaneId: ANCHOR_PANE_ID,
    nextNumber: 1,
  };
}

export function anchorPane(root: LayoutNode): PaneLeaf {
  let node = root;
  while (node.kind === "split") node = node.first;
  return node;
}

export function findPane(root: LayoutNode, paneId: string): PaneLeaf | null {
  if (root.kind === "pane") return root.id === paneId ? root : null;
  return findPane(root.first, paneId) ?? findPane(root.second, paneId);
}

export function listPanes(root: LayoutNode): PaneLeaf[] {
  if (root.kind === "pane") return [root];
  return [...listPanes(root.first), ...listPanes(root.second)];
}

export function isAnchorPane(root: LayoutNode, paneId: string): boolean {
  return anchorPane(root).id === paneId;
}

function axisFor(direction: SplitDirection): SplitAxis {
  return direction === "left" || direction === "right" ? "x" : "y";
}

function ancestorAxes(root: LayoutNode, paneId: string): SplitAxis[] {
  const axes: SplitAxis[] = [];
  function walk(node: LayoutNode, trail: SplitAxis[]): boolean {
    if (node.kind === "pane") {
      if (node.id !== paneId) return false;
      axes.push(...trail);
      return true;
    }
    const next = [...trail, node.axis];
    return walk(node.first, next) || walk(node.second, next);
  }
  walk(root, []);
  return axes;
}

function isPinnedTab(
  root: LayoutNode,
  paneId: string,
  tabId: CanvasTabId,
  statsEnabled: boolean
): boolean {
  if (!isAnchorPane(root, paneId)) return false;
  if (tabId === "report") return true;
  return tabId === "analytics" && statsEnabled;
}

/** Pinned Report and Analytics copy; other tabs move. */
function copiesOnMove(
  root: LayoutNode,
  paneId: string,
  tabId: CanvasTabId,
  statsEnabled: boolean
): boolean {
  return isPinnedTab(root, paneId, tabId, statsEnabled);
}

export function canSplitPane(
  layout: CanvasLayout,
  paneId: string,
  direction: SplitDirection,
  tabId: CanvasTabId,
  statsEnabled: boolean
): boolean {
  const pane = findPane(layout.root, paneId);
  if (!pane || !pane.tabIds.includes(tabId)) return false;
  if (ancestorAxes(layout.root, paneId).includes(axisFor(direction))) {
    return false;
  }
  if (
    isAnchorPane(layout.root, paneId) &&
    (direction === "left" || direction === "up")
  ) {
    return false;
  }
  if (
    !isPinnedTab(layout.root, paneId, tabId, statsEnabled) &&
    pane.tabIds.length <= 1
  ) {
    return false;
  }
  return true;
}

function clampRatio(ratio: number): number {
  return Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, ratio));
}

function mapNode(
  node: LayoutNode,
  visit: (pane: PaneLeaf) => PaneLeaf
): LayoutNode {
  if (node.kind === "pane") return visit(node);
  const first = mapNode(node.first, visit);
  const second = mapNode(node.second, visit);
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}

function replacePane(
  node: LayoutNode,
  paneId: string,
  next: LayoutNode
): LayoutNode {
  if (node.kind === "pane") return node.id === paneId ? next : node;
  const first = replacePane(node.first, paneId, next);
  const second = replacePane(node.second, paneId, next);
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}

function removePane(node: LayoutNode, paneId: string): LayoutNode | null {
  if (node.kind === "pane") return node.id === paneId ? null : node;
  const first = removePane(node.first, paneId);
  const second = removePane(node.second, paneId);
  if (first == null) return second;
  if (second == null) return first;
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}

function siblingOf(node: LayoutNode, paneId: string): LayoutNode | null {
  if (node.kind === "pane") return null;
  if (node.first.kind === "pane" && node.first.id === paneId) return node.second;
  if (node.second.kind === "pane" && node.second.id === paneId) return node.first;
  return siblingOf(node.first, paneId) ?? siblingOf(node.second, paneId);
}

function firstPane(node: LayoutNode): PaneLeaf {
  return node.kind === "pane" ? node : firstPane(node.first);
}

function withRecents(pane: PaneLeaf, tabId: CanvasTabId): CanvasTabId[] {
  const next = pane.recents.filter(
    (id) => id !== tabId && pane.tabIds.includes(id)
  );
  next.push(tabId);
  return next.slice(-8);
}

function selectOnPane(pane: PaneLeaf, tabId: CanvasTabId): PaneLeaf {
  const tabIds = pane.tabIds.includes(tabId)
    ? pane.tabIds
    : [...pane.tabIds, tabId];
  const next: PaneLeaf = { ...pane, tabIds, activeTabId: tabId };
  return { ...next, recents: withRecents(next, tabId) };
}

function applyAnchorPins(root: LayoutNode, statsEnabled: boolean): LayoutNode {
  const anchor = anchorPane(root);
  const rest = anchor.tabIds.filter(
    (id) => id !== "report" && id !== "analytics"
  );
  const withoutAnalytics: CanvasTabId[] = statsEnabled
    ? ["report", "analytics", ...rest]
    : ["report", ...rest];
  const active = withoutAnalytics.includes(anchor.activeTabId)
    ? anchor.activeTabId
    : "report";
  const pinned: PaneLeaf = {
    ...anchor,
    tabIds: withoutAnalytics,
    activeTabId: active,
    recents: anchor.recents.filter((id) => withoutAnalytics.includes(id)),
  };
  if (
    pinned.tabIds.join() === anchor.tabIds.join() &&
    pinned.activeTabId === anchor.activeTabId
  ) {
    return root;
  }
  return replacePane(root, anchor.id, pinned);
}

function stripDisabledAnalytics(
  root: LayoutNode,
  statsEnabled: boolean
): LayoutNode {
  if (statsEnabled) return root;
  return mapNode(root, (pane) => {
    if (isAnchorPane(root, pane.id)) return pane;
    if (!pane.tabIds.includes("analytics")) return pane;
    const tabIds: CanvasTabId[] = pane.tabIds.filter((id) => id !== "analytics");
    if (tabIds.length === 0) return { ...pane, tabIds, activeTabId: "report" };
    const active = tabIds.includes(pane.activeTabId) ? pane.activeTabId : tabIds[0]!;
    return {
      ...pane,
      tabIds,
      activeTabId: active,
      recents: pane.recents.filter((id) => tabIds.includes(id)),
    };
  });
}

function dropEmptyPanes(root: LayoutNode): LayoutNode {
  const anchorId = anchorPane(root).id;
  let next = root;
  for (const pane of listPanes(root)) {
    if (pane.id === anchorId || pane.tabIds.length > 0) continue;
    const removed = removePane(next, pane.id);
    if (removed) next = removed;
  }
  return next;
}

function finish(layout: CanvasLayout, statsEnabled: boolean): CanvasLayout {
  let root = stripDisabledAnalytics(layout.root, statsEnabled);
  root = applyAnchorPins(root, statsEnabled);
  root = dropEmptyPanes(root);
  const focused = findPane(root, layout.focusedPaneId)
    ? layout.focusedPaneId
    : anchorPane(root).id;
  if (root === layout.root && focused === layout.focusedPaneId) return layout;
  return { ...layout, root, focusedPaneId: focused };
}

export function focusPane(layout: CanvasLayout, paneId: string): CanvasLayout {
  if (!findPane(layout.root, paneId)) return layout;
  if (layout.focusedPaneId === paneId) return layout;
  return { ...layout, focusedPaneId: paneId };
}

export function selectTab(
  layout: CanvasLayout,
  paneId: string,
  tabId: CanvasTabId
): CanvasLayout {
  const pane = findPane(layout.root, paneId);
  if (!pane || !pane.tabIds.includes(tabId)) return layout;
  const root = replacePane(layout.root, paneId, selectOnPane(pane, tabId));
  return { ...layout, root, focusedPaneId: paneId };
}

export function openTabOnPane(
  layout: CanvasLayout,
  paneId: string,
  tabId: CanvasTabId,
  statsEnabled: boolean
): CanvasLayout {
  if (tabId === "history") {
    const existing = listPanes(layout.root).find((pane) =>
      pane.tabIds.includes("history")
    );
    if (existing && existing.id !== paneId) {
      return openTabOnPane(
        closeTab(layout, existing.id, "history", statsEnabled),
        paneId,
        tabId,
        statsEnabled
      );
    }
    if (existing) return selectTab(layout, existing.id, "history");
  }
  const pane = findPane(layout.root, paneId);
  if (!pane) return layout;
  const root = replacePane(layout.root, paneId, selectOnPane(pane, tabId));
  return finish({ ...layout, root, focusedPaneId: paneId }, statsEnabled);
}

/** Drag a tab onto another pane. Pinned Report and Analytics on the anchor are copied. */
export function moveTabToPane(
  layout: CanvasLayout,
  fromPaneId: string,
  toPaneId: string,
  tabId: CanvasTabId,
  statsEnabled: boolean
): CanvasLayout {
  if (fromPaneId === toPaneId) return layout;
  const source = findPane(layout.root, fromPaneId);
  const target = findPane(layout.root, toPaneId);
  if (!source || !target || !source.tabIds.includes(tabId)) return layout;
  const copy = copiesOnMove(layout.root, fromPaneId, tabId, statsEnabled);
  const opened = openTabOnPane(layout, toPaneId, tabId, statsEnabled);
  if (copy || tabId === "history") return opened;
  return closeTab(opened, fromPaneId, tabId, statsEnabled);
}

export function openAttachmentOnPane(
  layout: CanvasLayout,
  paneId: string,
  attachmentId: string,
  statsEnabled: boolean
): CanvasLayout {
  return openTabOnPane(
    layout,
    paneId,
    attachmentTabId(attachmentId),
    statsEnabled
  );
}

export function splitPane(
  layout: CanvasLayout,
  paneId: string,
  direction: SplitDirection,
  tabId: CanvasTabId,
  statsEnabled: boolean
): CanvasLayout {
  if (!canSplitPane(layout, paneId, direction, tabId, statsEnabled)) {
    return layout;
  }
  const source = findPane(layout.root, paneId);
  if (!source) return layout;
  const copy = isPinnedTab(layout.root, paneId, tabId, statsEnabled);
  const newPane: PaneLeaf = {
    kind: "pane",
    id: `pane-${layout.nextNumber}`,
    tabIds: [tabId],
    activeTabId: tabId,
    recents: [tabId],
  };
  let sourceNext = source;
  if (!copy) {
    const tabIds = source.tabIds.filter((id) => id !== tabId);
    const active =
      source.activeTabId === tabId
        ? tabIdAfterClosing({
            closedId: tabId,
            currentlyActive: source.activeTabId,
            recents: source.recents,
            remainingTabIds: tabIds,
          })
        : source.activeTabId;
    sourceNext = {
      ...source,
      tabIds,
      activeTabId: tabIds.includes(active) ? active : tabIds[0]!,
      recents: source.recents.filter((id) => id !== tabId),
    };
  }
  const axis = axisFor(direction);
  const placeNewFirst = direction === "left" || direction === "up";
  const split: SplitNode = {
    kind: "split",
    id: `split-${layout.nextNumber}`,
    axis,
    ratio: SPLIT_RATIO_DEFAULT,
    first: placeNewFirst ? newPane : sourceNext,
    second: placeNewFirst ? sourceNext : newPane,
  };
  return finish(
    {
      root: replacePane(layout.root, paneId, split),
      focusedPaneId: newPane.id,
      nextNumber: layout.nextNumber + 1,
    },
    statsEnabled
  );
}

export function closeTab(
  layout: CanvasLayout,
  paneId: string,
  tabId: CanvasTabId,
  statsEnabled: boolean
): CanvasLayout {
  if (isPinnedTab(layout.root, paneId, tabId, statsEnabled)) return layout;
  const pane = findPane(layout.root, paneId);
  if (!pane || !pane.tabIds.includes(tabId)) return layout;
  const tabIds = pane.tabIds.filter((id) => id !== tabId);
  if (tabIds.length === 0) {
    if (isAnchorPane(layout.root, paneId)) return layout;
    const sibling = siblingOf(layout.root, paneId);
    const removed = removePane(layout.root, paneId);
    if (!removed) return layout;
    const focused =
      layout.focusedPaneId === paneId
        ? sibling
          ? firstPane(sibling).id
          : ANCHOR_PANE_ID
        : layout.focusedPaneId;
    return finish(
      { ...layout, root: removed, focusedPaneId: focused },
      statsEnabled
    );
  }
  const active = tabIdAfterClosing({
    closedId: tabId,
    currentlyActive: pane.activeTabId,
    recents: pane.recents,
    remainingTabIds: tabIds,
  });
  const next: PaneLeaf = {
    ...pane,
    tabIds,
    activeTabId: tabIds.includes(active) ? active : tabIds[0]!,
    recents: pane.recents.filter((id) => id !== tabId),
  };
  return finish(
    { ...layout, root: replacePane(layout.root, paneId, next) },
    statsEnabled
  );
}

export function closeOtherTabs(
  layout: CanvasLayout,
  paneId: string,
  keepTabId: CanvasTabId,
  statsEnabled: boolean
): CanvasLayout {
  const pane = findPane(layout.root, paneId);
  if (!pane || !pane.tabIds.includes(keepTabId)) return layout;
  const keep = new Set<CanvasTabId>([keepTabId]);
  if (isAnchorPane(layout.root, paneId)) {
    keep.add("report");
    if (statsEnabled) keep.add("analytics");
  }
  const tabIds = pane.tabIds.filter((id) => keep.has(id));
  if (tabIds.length === pane.tabIds.length) return layout;
  const active = tabIds.includes(pane.activeTabId) ? pane.activeTabId : keepTabId;
  const next: PaneLeaf = {
    ...pane,
    tabIds,
    activeTabId: active,
    recents: pane.recents.filter((id) => tabIds.includes(id)),
  };
  return finish(
    { ...layout, root: replacePane(layout.root, paneId, next), focusedPaneId: paneId },
    statsEnabled
  );
}

export function setSplitRatio(
  layout: CanvasLayout,
  splitId: string,
  ratio: number
): CanvasLayout {
  const nextRatio = clampRatio(ratio);
  function walk(node: LayoutNode): LayoutNode {
    if (node.kind === "pane") return node;
    if (node.id === splitId) {
      if (node.ratio === nextRatio) return node;
      return { ...node, ratio: nextRatio };
    }
    const first = walk(node.first);
    const second = walk(node.second);
    if (first === node.first && second === node.second) return node;
    return { ...node, first, second };
  }
  const root = walk(layout.root);
  if (root === layout.root) return layout;
  return { ...layout, root };
}

export function pruneCanvasLayout(
  layout: CanvasLayout,
  args: {
    statsEnabled: boolean;
    liveAttachmentIds: ReadonlySet<string>;
    historyOpen: boolean;
  }
): CanvasLayout {
  const root = mapNode(layout.root, (pane) => {
    const tabIds = pane.tabIds.filter((id) => {
      if (id === "history") return args.historyOpen;
      if (id === "analytics") return args.statsEnabled || isAnchorPane(layout.root, pane.id);
      if (id.startsWith("attachment:")) {
        return args.liveAttachmentIds.has(id.slice("attachment:".length));
      }
      return true;
    });
    if (tabIds.length === pane.tabIds.length) return pane;
    const active = tabIds.includes(pane.activeTabId)
      ? pane.activeTabId
      : tabIds[0] ?? pane.activeTabId;
    return {
      ...pane,
      tabIds,
      activeTabId: active,
      recents: pane.recents.filter((id) => tabIds.includes(id)),
    };
  });
  const base = root === layout.root ? layout : { ...layout, root };
  return finish(base, args.statsEnabled);
}

/** Contents / section jumps always land on the live editor, not a view-only copy. */
export function paneForReportJump(layout: CanvasLayout): PaneLeaf {
  return anchorPane(layout.root);
}

/**
 * The pane that should host the single live instance of `tabId`. Prefers the
 * focused pane when that tab is in front, then any pane showing it, then the
 * first pane that still has the tab (usually parked on the anchor).
 */
export function livePaneForTab(
  layout: CanvasLayout,
  tabId: CanvasTabId
): PaneLeaf | null {
  const panes = listPanes(layout.root).filter((pane) =>
    pane.tabIds.includes(tabId)
  );
  if (panes.length === 0) return null;
  const focused = findPane(layout.root, layout.focusedPaneId);
  if (focused?.tabIds.includes(tabId) && focused.activeTabId === tabId) {
    return focused;
  }
  return panes.find((pane) => pane.activeTabId === tabId) ?? panes[0]!;
}

export function attachmentIdsInPane(pane: PaneLeaf): string[] {
  return pane.tabIds.flatMap((id) =>
    id.startsWith("attachment:") ? [id.slice("attachment:".length)] : []
  );
}
