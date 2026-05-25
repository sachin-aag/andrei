"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  ChevronDown,
  ChevronRight,
  FunctionSquare,
  Subscript,
  Superscript,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MathEditorDialog } from "@/components/report/math-editor-dialog";
import { toast } from "sonner";

type AdvancedFormattingToolbarProps = {
  editor: Editor;
};

export function AdvancedFormattingToolbar({ editor }: AdvancedFormattingToolbarProps) {
  const [open, setOpen] = useState(false);
  const [mathDialogOpen, setMathDialogOpen] = useState(false);
  const [mathMode, setMathMode] = useState<"inline" | "block">("inline");

  const insertEquation = (mathml: string, latex?: string | null) => {
    const attrs = { mathml, latex: latex ?? null, omml: null, ommlDirty: true };
    if (mathMode === "block") {
      editor.chain().focus().insertMathBlock(attrs).run();
    } else {
      editor.chain().focus().insertMathInline(attrs).run();
    }
  };

  return (
    <div className="relative flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 w-fit px-1.5 text-xs gap-1 text-[var(--muted-foreground)]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Math
      </Button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 flex flex-wrap items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-1 py-0.5 shadow-sm">
          <Button
            type="button"
            variant={editor.isActive("subscript") ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-1.5 text-xs"
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            title="Subscript"
          >
            <Subscript className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant={editor.isActive("superscript") ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-1.5 text-xs"
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            title="Superscript"
          >
            <Superscript className="size-3.5" />
          </Button>
          <div className="mx-0.5 h-4 w-px bg-[var(--border)]" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs gap-1"
            onClick={() => {
              setMathMode("inline");
              setMathDialogOpen(true);
            }}
            title="Insert inline equation"
          >
            <FunctionSquare className="size-3.5" />
            Equation
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-6 px-1.5 text-xs")}
            onClick={() => {
              setMathMode("block");
              setMathDialogOpen(true);
            }}
            title="Insert block equation"
          >
            Block eq.
          </Button>
        </div>
      ) : null}
      <MathEditorDialog
        open={mathDialogOpen}
        onOpenChange={setMathDialogOpen}
        initialMathml=""
        title={mathMode === "block" ? "Insert block equation" : "Insert inline equation"}
        onSave={({ mathml, latex }) => {
          if (!mathml.trim() && !latex?.trim()) {
            toast.error("Equation cannot be empty.");
            return;
          }
          insertEquation(mathml, latex);
          setMathDialogOpen(false);
        }}
      />
    </div>
  );
}
