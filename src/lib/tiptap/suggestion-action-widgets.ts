import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import { extendPosPastOpenBracketClose } from "@/lib/text/bracket-span";

export const suggestionActionWidgetsRefreshMeta = "suggestionActionWidgetsRefresh";

export type SuggestionActionWidgetState = {
  enabled: boolean;
  actionableEvaluationIds: Set<string>;
  pendingId: string | null;
  onAccept: (evaluationId: string) => void;
  onIgnore: (evaluationId: string) => void;
};

type PluginState = {
  decos: DecorationSet;
};

const suggestionActionWidgetsKey = new PluginKey<PluginState>(
  "suggestionActionWidgets"
);

const CHECK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

const X_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

const SPINNER_ICON =
  '<svg class="suggestion-action-spinner" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

function actionButton({
  label,
  className,
  disabled,
  icon,
  onClick,
}: {
  label: string;
  className: string;
  disabled: boolean;
  icon: string;
  onClick: () => void;
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.tabIndex = -1;
  button.disabled = disabled;
  button.innerHTML = icon;
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!button.disabled) onClick();
  });
  return button;
}

function widgetEl(evaluationId: string, state: SuggestionActionWidgetState) {
  const pending = state.pendingId === evaluationId;
  const disabled = state.pendingId !== null;
  const wrap = document.createElement("span");
  wrap.className = "suggestion-action-widget";
  wrap.setAttribute("contenteditable", "false");
  wrap.setAttribute("data-eval-id", evaluationId);

  wrap.appendChild(
    actionButton({
      label: pending ? "Applying suggestion" : "Accept suggestion",
      className: "suggestion-action-button suggestion-action-button-accept",
      disabled,
      icon: pending ? SPINNER_ICON : CHECK_ICON,
      onClick: () => state.onAccept(evaluationId),
    })
  );
  const divider = document.createElement("span");
  divider.className = "suggestion-action-divider";
  divider.setAttribute("aria-hidden", "true");
  wrap.appendChild(divider);
  wrap.appendChild(
    actionButton({
      label: "Ignore suggestion",
      className: "suggestion-action-button suggestion-action-button-ignore",
      disabled,
      icon: X_ICON,
      onClick: () => state.onIgnore(evaluationId),
    })
  );

  return wrap;
}

export type SuggestionActionWidgetAnchor = {
  evaluationId: string;
  pos: number;
};

type MarkedSpan = {
  id: string;
  start: number;
  end: number;
  isInsert: boolean;
};

type Cluster = {
  end: number;
  insertEnd: number | null;
};

function hasUnmarkedTextBetween(
  doc: PMNode,
  from: number,
  to: number,
  evaluationId: string
): boolean {
  if (to <= from) return false;
  const insertType = doc.type.schema.marks[suggestionInsertMarkName];
  const deleteType = doc.type.schema.marks[suggestionDeleteMarkName];
  let found = false;
  doc.nodesBetween(from, to, (node) => {
    if (found || !node.isText) return !found;
    const marked = node.marks.some((mark) => {
      if (mark.type !== insertType && mark.type !== deleteType) return false;
      const attrs = mark.attrs as { id?: string | null; authorId?: string };
      return attrs.id === evaluationId && attrs.authorId === "ai";
    });
    if (!marked && (node.text?.length ?? 0) > 0) found = true;
    return !found;
  });
  return found;
}

function clusterSpans(doc: PMNode, spans: MarkedSpan[]): Cluster[] {
  const ordered = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const clusters: Cluster[] = [];
  for (const span of ordered) {
    const last = clusters[clusters.length - 1];
    if (last && !hasUnmarkedTextBetween(doc, last.end, span.start, span.id)) {
      last.end = Math.max(last.end, span.end);
      if (span.isInsert) {
        last.insertEnd = Math.max(last.insertEnd ?? 0, span.end);
      }
      continue;
    }
    clusters.push({
      end: span.end,
      insertEnd: span.isInsert ? span.end : null,
    });
  }
  return clusters;
}

/**
 * Widget anchors after each disjoint apply site. A contiguous replace (delete
 * then insert) is one cluster; a body edit plus a citation at the end of the
 * section is two. Clicking either widget accepts or dismisses the whole
 * suggestion. Prefer insert ends; delete-only clusters use the delete end.
 */
export function collectSuggestionActionWidgetPositions(
  doc: PMNode,
  actionableEvaluationIds: Set<string>
): SuggestionActionWidgetAnchor[] {
  const insertType = doc.type.schema.marks[suggestionInsertMarkName];
  const deleteType = doc.type.schema.marks[suggestionDeleteMarkName];
  const spansById = new Map<string, MarkedSpan[]>();

  const pushSpan = (span: MarkedSpan) => {
    const list = spansById.get(span.id) ?? [];
    list.push(span);
    spansById.set(span.id, list);
  };

  doc.descendants((node, pos) => {
    if (node.type.name === "imageInline") {
      const suggestionId = node.attrs.suggestionId as string | null | undefined;
      if (suggestionId && actionableEvaluationIds.has(suggestionId)) {
        pushSpan({
          id: suggestionId,
          start: pos,
          end: pos + node.nodeSize,
          isInsert: true,
        });
      }
      return true;
    }
    if (!node.isText) return true;
    const len = node.text?.length ?? 0;
    for (const mark of node.marks) {
      if (mark.type !== insertType && mark.type !== deleteType) continue;
      const attrs = mark.attrs as { id?: string | null; authorId?: string };
      if (!attrs.id || attrs.authorId !== "ai") continue;
      if (!actionableEvaluationIds.has(attrs.id)) continue;
      pushSpan({
        id: attrs.id,
        start: pos,
        end: pos + len,
        isInsert: mark.type === insertType,
      });
    }
    return true;
  });

  const anchors: SuggestionActionWidgetAnchor[] = [];
  for (const id of actionableEvaluationIds) {
    const spans = spansById.get(id);
    if (!spans?.length) continue;
    for (const cluster of clusterSpans(doc, spans)) {
      const raw = cluster.insertEnd ?? cluster.end;
      anchors.push({
        evaluationId: id,
        pos: extendPosPastOpenBracketClose(doc, raw),
      });
    }
  }
  return anchors.sort((a, b) => a.pos - b.pos || a.evaluationId.localeCompare(b.evaluationId));
}

function collectActionPositions(
  doc: PMNode,
  state: SuggestionActionWidgetState
) {
  return collectSuggestionActionWidgetPositions(doc, state.actionableEvaluationIds);
}

function buildSet(doc: PMNode, state: SuggestionActionWidgetState) {
  if (!state.enabled) return DecorationSet.empty;

  const decos: Decoration[] = [];
  const positions = collectActionPositions(doc, state);
  for (const { evaluationId, pos } of positions) {
      decos.push(
      Decoration.widget(pos, () => widgetEl(evaluationId, state), {
        key: `suggestion-action-${evaluationId}-${pos}-${state.pendingId ?? "idle"}`,
        side: 1,
        ignoreSelection: true,
        stopEvent: (event) => {
          const target = event.target as HTMLElement | null;
          return Boolean(target?.closest("button"));
        },
      })
    );
  }
  return DecorationSet.create(doc, decos);
}

export function createSuggestionActionWidgetsExtension(
  getState: () => SuggestionActionWidgetState
) {
  return Extension.create({
    name: "suggestionActionWidgets",
    addProseMirrorPlugins() {
      return [
        new Plugin<PluginState>({
          key: suggestionActionWidgetsKey,
          state: {
            init(_, state) {
              return { decos: buildSet(state.doc, getState()) };
            },
            apply(tr, prev, _oldState, newState) {
              if (tr.docChanged || tr.getMeta(suggestionActionWidgetsRefreshMeta)) {
                return { decos: buildSet(newState.doc, getState()) };
              }
              return { decos: prev.decos.map(tr.mapping, tr.doc) };
            },
          },
          props: {
            decorations(state) {
              return (
                suggestionActionWidgetsKey.getState(state)?.decos ??
                DecorationSet.empty
              );
            },
          },
        }),
      ];
    },
  });
}
