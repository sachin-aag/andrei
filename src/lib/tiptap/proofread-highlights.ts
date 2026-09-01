import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { locateEdit } from "@/lib/suggestions/locator";
import { hashProofreadText } from "@/lib/proofread/hash";
import type { ProofreadIssue } from "@/lib/ai/proofread/types";

export const proofreadRefreshMeta = "proofreadRefresh";

export type LocatedProofreadIssue = ProofreadIssue & {
  from: number;
  to: number;
};

export type ProofreadHighlightState = {
  issues: ProofreadIssue[];
  activeIssueId: string | null;
  onActivate: (id: string) => void;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
};

type PluginState = {
  decos: DecorationSet;
  located: LocatedProofreadIssue[];
};

const proofreadKey = new PluginKey<PluginState>("proofreadHighlights");

const BLOCK_NAMES = new Set(["paragraph", "heading"]);

type TextChunk = { pmStart: number; text: string };

function collectBlockChunks(block: PMNode, blockPos: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  block.forEach((child, offset) => {
    if (child.isText && child.text) {
      chunks.push({ pmStart: blockPos + 1 + offset, text: child.text });
    } else if (child.type.name === "hardBreak") {
      chunks.push({ pmStart: blockPos + 1 + offset, text: "\n" });
    }
  });
  return chunks;
}

function pmOffsetToPos(chunks: TextChunk[], rel: number): number {
  let remaining = rel;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (remaining < chunk.text.length) {
      return chunk.pmStart + remaining;
    }
    if (remaining === chunk.text.length) {
      const next = chunks[i + 1];
      if (next) return next.pmStart;
      return chunk.pmStart + remaining;
    }
    remaining -= chunk.text.length;
  }
  const last = chunks[chunks.length - 1];
  return last ? last.pmStart + last.text.length : 0;
}

export function locateProofreadIssuesInPmDoc(
  doc: PMNode,
  issues: ProofreadIssue[]
): LocatedProofreadIssue[] {
  if (issues.length === 0) return [];
  const byHash = new Map<string, ProofreadIssue[]>();
  for (const issue of issues) {
    const list = byHash.get(issue.unitHash) ?? [];
    list.push(issue);
    byHash.set(issue.unitHash, list);
  }

  const located: LocatedProofreadIssue[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "table") return false;
    if (!BLOCK_NAMES.has(node.type.name)) return true;
    const chunks = collectBlockChunks(node, pos);
    if (chunks.length === 0) return true;
    const flat = chunks.map((c) => c.text).join("");
    const hash = hashProofreadText(flat.trim());
    const candidates = byHash.get(hash);
    if (!candidates) return true;
    for (const issue of candidates) {
      const result = locateEdit(flat, {
        anchorText: issue.anchorText,
        deleteText: issue.deleteText,
        insertText: issue.insertText,
      });
      if (result.status !== "located") continue;
      const from = pmOffsetToPos(chunks, result.deleteStart);
      const to = pmOffsetToPos(chunks, result.deleteEnd);
      if (to <= from) continue;
      located.push({ ...issue, from, to });
    }
    return true;
  });
  return located;
}

function popoverEl(
  issue: LocatedProofreadIssue,
  state: ProofreadHighlightState
): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "proofread-popover";
  wrap.setAttribute("contenteditable", "false");
  wrap.setAttribute("data-testid", "proofread-popover");
  wrap.setAttribute("data-proofread-id", issue.id);

  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "proofread-popover-apply";
  apply.textContent = issue.label || issue.insertText;
  apply.setAttribute("aria-label", `Apply ${issue.label || issue.insertText}`);
  apply.addEventListener("mousedown", (event) => event.preventDefault());
  apply.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.onAccept(issue.id);
  });
  wrap.appendChild(apply);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "proofread-popover-dismiss";
  dismiss.setAttribute("aria-label", "Dismiss suggestion");
  dismiss.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  dismiss.addEventListener("mousedown", (event) => event.preventDefault());
  dismiss.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.onDismiss(issue.id);
  });
  wrap.appendChild(dismiss);

  return wrap;
}

function buildDecorations(
  doc: PMNode,
  state: ProofreadHighlightState
): { decos: DecorationSet; located: LocatedProofreadIssue[] } {
  const located = locateProofreadIssuesInPmDoc(doc, state.issues);
  const decos: Decoration[] = [];
  for (const issue of located) {
    decos.push(
      Decoration.inline(issue.from, issue.to, {
        class: `proofread-issue proofread-issue-${issue.severity}`,
        "data-proofread-id": issue.id,
        "data-proofread-severity": issue.severity,
        "data-testid": "proofread-issue",
      })
    );
    if (state.activeIssueId === issue.id) {
      decos.push(
        Decoration.widget(issue.to, () => popoverEl(issue, state), {
          side: 1,
          key: `proofread-popover-${issue.id}`,
          ignoreSelection: true,
        })
      );
    }
  }
  return { decos: DecorationSet.create(doc, decos), located };
}

export function issueIdAtPos(
  located: LocatedProofreadIssue[],
  pos: number
): string | null {
  const hit = located.find((issue) => pos >= issue.from && pos <= issue.to);
  return hit?.id ?? null;
}

export function createProofreadHighlightExtension(
  getState: () => ProofreadHighlightState
) {
  return Extension.create({
    name: "proofreadHighlights",
    addProseMirrorPlugins() {
      return [
        new Plugin<PluginState>({
          key: proofreadKey,
          state: {
            init(_, { doc }) {
              return buildDecorations(doc, getState());
            },
            apply(tr, prev, _oldState, newState) {
              if (tr.docChanged || tr.getMeta(proofreadRefreshMeta)) {
                return buildDecorations(newState.doc, getState());
              }
              return {
                decos: prev.decos.map(tr.mapping, tr.doc),
                located: prev.located,
              };
            },
          },
          props: {
            decorations(state) {
              return proofreadKey.getState(state)?.decos ?? DecorationSet.empty;
            },
            handleClick(view: EditorView, pos: number, event: MouseEvent) {
              const target = event.target as HTMLElement;
              if (target.closest(".proofread-popover")) return true;
              const pluginState = proofreadKey.getState(view.state);
              if (!pluginState) return false;
              const id = issueIdAtPos(pluginState.located, pos);
              if (!id) {
                if (getState().activeIssueId) getState().onActivate("");
                return false;
              }
              getState().onActivate(id);
              return true;
            },
          },
        }),
      ];
    },
  });
}

export function proofreadPluginLocated(
  state: EditorState
): LocatedProofreadIssue[] {
  return proofreadKey.getState(state)?.located ?? [];
}
