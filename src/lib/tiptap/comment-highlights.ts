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
};

const commentHighlightKey = new PluginKey<DecorationSet>("commentHighlights");

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

function buildSet(
  doc: PMNode,
  ranges: CommentHighlightRange[],
  onActivate: (id: string) => void
) {
  const decos: Decoration[] = [];
  const max = doc.content.size;
  for (const r of ranges) {
    const from = Math.max(0, Math.min(r.from, max));
    const to = Math.max(from, Math.min(r.to, max));
    if (from >= to) continue;

    let cls = "comment-highlight";
    if (r.resolved) cls += " comment-highlight-resolved";
    else if (r.active) cls += " comment-highlight-active";

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

export function createCommentHighlightExtension(
  getRanges: () => CommentHighlightRange[],
  getHandlers: () => { onCommentActivate: (commentId: string) => void }
) {
  return Extension.create({
    name: "commentHighlights",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: commentHighlightKey,
          state: {
            init(_, state) {
              return buildSet(state.doc, getRanges(), getHandlers().onCommentActivate);
            },
            apply(tr, prev, _oldState, newState) {
              if (tr.getMeta("commentRefresh") || tr.docChanged) {
                return buildSet(
                  newState.doc,
                  getRanges(),
                  getHandlers().onCommentActivate
                );
              }
              return prev.map(tr.mapping, tr.doc);
            },
          },
          props: {
            decorations(state) {
              return commentHighlightKey.getState(state) ?? DecorationSet.empty;
            },
            handleClick(_view, _pos, event) {
              const t = event.target as HTMLElement | null;
              if (!t) return false;
              const el = t.closest("[data-comment-id]");
              if (!el) return false;
              if (el.classList.contains("comment-thread-bubble")) return false;
              const id = el.getAttribute("data-comment-id");
              if (!id) return false;
              getHandlers().onCommentActivate(id);
              return true;
            },
          },
        }),
      ];
    },
  });
}
