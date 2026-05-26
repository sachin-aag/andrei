"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { cn } from "@/lib/utils";
import { MathEditorDialog } from "@/components/report/math-editor-dialog";
import "mathlive/static.css";

type MathfieldElement = HTMLElement & {
  setValue: (value: string, options?: { format?: string }) => void;
  getValue: (format?: string) => string;
};

export function MathNodeView({ node, selected, updateAttributes, editor, getPos }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef<MathfieldElement | null>(null);
  const mathml = (node.attrs.mathml as string) ?? "";
  const latex = typeof node.attrs.latex === "string" ? node.attrs.latex : null;
  const isBlock = node.type.name === "mathBlock";

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
          selected && "ring-2 ring-[var(--ring)]"
        )}
        contentEditable={false}
        onMouseDown={openEditor}
      >
        <math-field
          ref={fieldRef}
          readOnly
          class={cn(
            "pointer-events-none border-0 bg-transparent p-0",
            isBlock ? "block w-full" : "inline-block"
          )}
        />
        {!mathml ? (
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
