import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export type CommentHighlightRange = {
  id: string;
  from: number;
  to: number;
  resolved?: boolean;
  /** Dark yellow when this thread is selected (sidebar or doc). */
  active?: boolean;
  /** Medium yellow when the cursor hovers over this range or its gutter card. */
  hovered?: boolean;
  /** AI-emitted comment (kind starts with `ai_`) — uses a distinct decoration class. */
  ai?: boolean;
};

export type CommentHighlightHandlers = {
  onCommentActivate: (commentId: string) => void;
  onCommentHover: (commentIds: string[]) => void;
  onCommentDeactivate: () => void;
  /** AI criterion fixes use evaluation id on suggestion marks; used when the doc click misses comment decorations. */
  onAiSuggestionMarkActivate?: (evaluationId: string) => void;
};

type TrackedRange = {
  id: string;
  from: number;
  to: number;
  /** Original positions used to detect when an external range was reset (e.g. new comment). */
  initFrom: number;
  initTo: number;
  resolved: boolean;
  active: boolean;
  hovered: boolean;
  ai: boolean;
};

type PluginState = {
  decos: DecorationSet;
  ranges: TrackedRange[];
};

const commentHighlightKey = new PluginKey<PluginState>("commentHighlights");

function bubbleEl(commentId: string, resolved: boolean, onActivate: (id: string) => void) {
  const wrap = document.createElement("span");
  wrap.className = resolved
    ? "comment-thread-bubble comment-thread-bubble-resolved"
    : "comment-thread-bubble";
  wrap.setAttribute("data-comment-id", commentId);
  wrap.setAttribute("contenteditable", "false");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "comment-thread-bubble-btn";
  btn.setAttribute("aria-label", "Open comment thread");
  btn.title = "Open comment";
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onActivate(commentId);
  });
  wrap.appendChild(btn);
  return wrap;
}

function collectCommentIds(target: HTMLElement): string[] {
  const ids: string[] = [];
  let el: HTMLElement | null = target;
  while (el) {
    const id = el.getAttribute("data-comment-id");
    if (id && !ids.includes(id)) ids.push(id);
    el = el.parentElement;
  }
  return ids;
}

function buildSet(
  doc: PMNode,
  ranges: TrackedRange[],
  onActivate: (id: string) => void
) {
  const decos: Decoration[] = [];
  const max = doc.content.size;
  for (const r of ranges) {
    const from = Math.max(0, Math.min(r.from, max));
    const to = Math.max(from, Math.min(r.to, max));
    if (from >= to) continue;

    let cls = "comment-highlight";
    cls += r.ai ? " comment-highlight-ai" : " comment-highlight-human";
    if (r.resolved) cls += " comment-highlight-resolved";
    else if (r.active) cls += " comment-highlight-active";
    else if (r.hovered) cls += " comment-highlight-hovered";

    decos.push(
      Decoration.inline(from, to, {
        class: cls,
        "data-comment-id": r.id,
      })
    );

    decos.push(
      Decoration.widget(
        to,
        () => bubbleEl(r.id, !!r.resolved, onActivate),
        {
          key: `comment-bubble-${r.id}`,
          side: 1,
        }
      )
    );
  }
  return DecorationSet.create(doc, decos);
}

function syncRanges(
  prev: TrackedRange[],
  external: CommentHighlightRange[]
): TrackedRange[] {
  const prevById = new Map(prev.map((r) => [r.id, r]));
  const next: TrackedRange[] = [];
  for (const r of external) {
    const existing = prevById.get(r.id);
    // Reset tracked positions if this is a new range, or if the external
    // anchor was reassigned (e.g. comment recreated). Otherwise keep the
    // mapped positions so the highlight stays anchored across edits.
    if (
      !existing ||
      existing.initFrom !== r.from ||
      existing.initTo !== r.to
    ) {
      next.push({
        id: r.id,
        from: r.from,
        to: r.to,
        initFrom: r.from,
        initTo: r.to,
        resolved: !!r.resolved,
        active: !!r.active,
        hovered: !!r.hovered,
        ai: !!r.ai,
      });
    } else {
      next.push({
        ...existing,
        resolved: !!r.resolved,
        active: !!r.active,
        hovered: !!r.hovered,
        ai: !!r.ai,
      });
    }
  }
  return next;
}

export function createCommentHighlightExtension(
  getRanges: () => CommentHighlightRange[],
  getHandlers: () => CommentHighlightHandlers
) {
  return Extension.create({
    name: "commentHighlights",
    addProseMirrorPlugins() {
      return [
        new Plugin<PluginState>({
          key: commentHighlightKey,
          state: {
            init(_, state) {
              const ranges = syncRanges([], getRanges());
              return {
                ranges,
                decos: buildSet(state.doc, ranges, getHandlers().onCommentActivate),
              };
            },
            apply(tr, prev, _oldState, newState) {
              let ranges = prev.ranges;
      if (tr.docChanged) {
        // Left-inclusive, right-exclusive boundaries: insertions strictly
        // INSIDE the range still grow the highlight, but insertions at the
        // exact boundaries stay OUTSIDE — so typing at the end of a comment
        // (e.g. pressing Enter to start a new paragraph) does not swallow
        // the new text into the highlight.
        ranges = ranges.map((r) => ({
          ...r,
          from: tr.mapping.map(r.from, 1),
          to: tr.mapping.map(r.to, -1),
        }));
      }
              if (tr.getMeta("commentRefresh") || tr.docChanged) {
                ranges = syncRanges(ranges, getRanges());
                return {
                  ranges,
                  decos: buildSet(
                    newState.doc,
                    ranges,
                    getHandlers().onCommentActivate
                  ),
                };
              }
              return {
                ranges,
                decos: prev.decos.map(tr.mapping, tr.doc),
              };
            },
          },
          props: {
            decorations(state) {
              return commentHighlightKey.getState(state)?.decos ?? DecorationSet.empty;
            },
            handleClick(_view, _pos, event) {
              const t = event.target as HTMLElement | null;
              if (!t) return false;
              const el = t.closest("[data-comment-id]");
              if (el) {
                if (el.classList.contains("comment-thread-bubble")) return false;
                const id = el.getAttribute("data-comment-id");
                if (!id) return false;
                getHandlers().onCommentActivate(id);
                return true;
              }
              const aiMark = t.closest(
                '[data-suggestion-author="ai"][data-eval-id]'
              ) as HTMLElement | null;
              if (aiMark) {
                const evalId = aiMark.getAttribute("data-eval-id");
                if (evalId) {
                  getHandlers().onAiSuggestionMarkActivate?.(evalId);
                  return true;
                }
              }
              getHandlers().onCommentDeactivate();
              return false;
            },
            handleDOMEvents: {
              mouseover(_view, event) {
                const t = event.target as HTMLElement | null;
                if (!t) return false;
                const ids = collectCommentIds(t);
                getHandlers().onCommentHover(ids);
                return false;
              },
              mouseleave(_view, _event) {
                getHandlers().onCommentHover([]);
                return false;
              },
            },
          },
        }),
      ];
    },
  });
}
