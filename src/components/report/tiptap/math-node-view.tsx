"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { cn } from "@/lib/utils";
import { MathEditorDialog } from "@/components/report/math-editor-dialog";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import "mathlive/static.css";

type MathfieldElement = HTMLElement & {
  setValue: (value: string, options?: { format?: string }) => void;
  getValue: (format?: string) => string;
};

function suggestionAppearance(marks: NodeViewProps["node"]["marks"]): {
  className?: string;
  evalId?: string;
} {
  for (const mark of marks ?? []) {
    const name = mark.type.name;
    if (name !== suggestionInsertMarkName && name !== suggestionDeleteMarkName) {
      continue;
    }
    const isAi = mark.attrs.authorId === "ai";
    const kind =
      typeof mark.attrs.kind === "string" ? mark.attrs.kind : "fix";
    const evalId =
      typeof mark.attrs.id === "string" ? mark.attrs.id : undefined;
    const kindClass =
      name === suggestionInsertMarkName ? "insert" : "delete";
    return {
      className: cn(
        `suggestion-${kindClass}`,
        `suggestion-${kindClass}-${kind}`,
        isAi && `suggestion-${kindClass}-ai`
      ),
      evalId,
    };
  }
  return {};
}

export function MathNodeView({ node, selected, updateAttributes, editor, getPos }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef<MathfieldElement | null>(null);
  const mathml = (node.attrs.mathml as string) ?? "";
  const latex = typeof node.attrs.latex === "string" ? node.attrs.latex : null;
  const isBlock = node.type.name === "mathBlock";
  const suggestion = suggestionAppearance(node.marks);

  const openEditor = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!editor.isEditable) return;
      const pos = getPos();
      if (typeof pos === "number") {
        editor.chain().focus().setNodeSelection(pos).run();
      }
      setOpen(true);
    },
    [editor, getPos]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await import("mathlive");
      if (cancelled || !fieldRef.current) return;
      if (latex) {
        fieldRef.current.setValue(latex, { format: "latex" });
      } else if (mathml) {
        fieldRef.current.setValue(mathml, { format: "math-ml" });
      } else {
        fieldRef.current.setValue("", { format: "math-ml" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mathml, latex]);

  const handleSave = useCallback(
    (next: { mathml: string; latex?: string | null }) => {
      updateAttributes({
        mathml: next.mathml,
        latex: next.latex ?? null,
        omml: null,
        ommlDirty: true,
      });
      setOpen(false);
    },
    [updateAttributes]
  );

  return (
    <>
      <NodeViewWrapper
        as={isBlock ? "div" : "span"}
        className={cn(
          "tiptap-math-node cursor-pointer rounded-sm",
          isBlock ? "tiptap-math-block my-2 block w-full" : "tiptap-math-inline inline-block align-middle",
          suggestion.className,
          selected && "ring-2 ring-[var(--ring)]"
        )}
        contentEditable={false}
        data-eval-id={suggestion.evalId}
        onMouseDown={openEditor}
      >
        <math-field
          ref={fieldRef}
          readOnly
          onMouseDown={openEditor}
          class={cn(
            "cursor-pointer border-0 bg-transparent p-0",
            isBlock ? "block w-full" : "inline-block"
          )}
        />
        {!mathml && !latex ? (
          <span className="text-xs text-[var(--muted-foreground)] italic">
            Empty equation — click to edit
          </span>
        ) : null}
      </NodeViewWrapper>
      <MathEditorDialog
        open={open}
        initialMathml={mathml}
        initialLatex={latex}
        title={isBlock ? "Edit block equation" : "Edit inline equation"}
        onOpenChange={setOpen}
        onSave={handleSave}
      />
    </>
  );
}
