import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MathNodeView } from "@/components/report/tiptap/math-node-view";

export type MathNodeAttrs = {
  mathml: string;
  omml?: string | null;
  ommlDirty?: boolean | null;
  /**
   * Optional LaTeX representation of the equation. Set when the equation was
   * extracted from a legacy WMF/OLE preview by the vision-LLM pipeline; lets
   * the editor prefill MathLive directly from LaTeX without a MathML round-trip.
   */
  latex?: string | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mathInline: {
      insertMathInline: (attrs: MathNodeAttrs) => ReturnType;
    };
    mathBlock: {
      insertMathBlock: (attrs: MathNodeAttrs) => ReturnType;
    };
  }
}

const sharedMathAttrs = {
  mathml: { default: "" },
  omml: { default: null },
  ommlDirty: { default: true },
  latex: { default: null },
};

function createMathNode(name: "mathInline" | "mathBlock", display: "inline" | "block") {
  return Node.create({
    name,
    group: display === "inline" ? "inline" : "block",
    inline: display === "inline",
    atom: true,
    selectable: true,
    draggable: true,
    addAttributes() {
      return sharedMathAttrs;
    },
    parseHTML() {
      return [
        {
          tag: `span[data-math-node="${name}"]`,
        },
      ];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "span",
        mergeAttributes(HTMLAttributes, {
          "data-math-node": name,
          class: display === "inline" ? "tiptap-math-inline" : "tiptap-math-block",
        }),
      ];
    },
    addNodeView() {
      return ReactNodeViewRenderer(MathNodeView);
    },
    addCommands() {
      return name === "mathInline"
        ? {
            insertMathInline:
              (attrs) =>
              ({ commands }) =>
                commands.insertContent({ type: name, attrs }),
          }
        : {
            insertMathBlock:
              (attrs) =>
              ({ commands }) =>
                commands.insertContent({ type: name, attrs }),
          };
    },
  });
}

export const MathInline = createMathNode("mathInline", "inline");
export const MathBlock = createMathNode("mathBlock", "block");
