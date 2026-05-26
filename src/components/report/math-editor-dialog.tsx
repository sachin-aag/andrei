"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import "mathlive/static.css";

type MathfieldElement = HTMLElement & {
  setValue: (value: string, options?: { format?: string }) => void;
  getValue: (format?: string) => string;
};

type MathEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMathml: string;
  /**
   * Optional LaTeX source. When present, MathLive is seeded from LaTeX
   * directly — preferred over MathML because LaTeX is the editor's native
   * format and avoids a lossy MathML round-trip.
   */
  initialLatex?: string | null;
  title: string;
  onSave: (value: { mathml: string; latex?: string | null }) => void;
};

export function MathEditorDialog({
  open,
  onOpenChange,
  initialMathml,
  initialLatex,
  title,
  onSave,
}: MathEditorDialogProps) {
  const fieldRef = useRef<MathfieldElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      await import("mathlive");
      if (cancelled) return;
      setReady(true);
      requestAnimationFrame(() => {
        const el = fieldRef.current;
        if (!el) return;
        el.style.width = "100%";
        el.style.maxWidth = "100%";
        el.style.boxSizing = "border-box";
        const latex = initialLatex?.trim();
        if (latex) {
          el.setValue(latex, { format: "latex" });
        } else if (initialMathml.trim()) {
          el.setValue(initialMathml, { format: "math-ml" });
        } else {
          el.setValue("", { format: "math-ml" });
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialMathml, initialLatex]);

  const handleSave = () => {
    const el = fieldRef.current;
    const mathml = el?.getValue("math-ml")?.trim() ?? "";
    const latex = el?.getValue("latex")?.trim() ?? "";
    onSave({ mathml, latex: latex || null });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setReady(false);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-3xl w-[min(calc(100vw-2rem),48rem)] gap-4 overflow-hidden">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Edit the equation using the math editor below, then save or cancel.
          </DialogDescription>
        </DialogHeader>
        <div className="math-editor-shell min-w-0 rounded-md border border-[var(--border)] bg-[var(--input)] p-3">
          {ready ? (
            <math-field
              ref={fieldRef}
              class="math-editor-field min-h-[3rem] w-full text-lg"
              virtual-keyboard-mode="manual"
            />
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">Loading equation editor…</p>
          )}
        </div>
        <DialogFooter className="min-w-0 gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!ready}>
            Save equation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
