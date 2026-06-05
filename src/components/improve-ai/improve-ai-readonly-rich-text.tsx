"use client";

import { useEffect, useMemo } from "react";
import type { JSONContent } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import { cn } from "@/lib/utils";
import { createReadOnlyRichTextExtensions } from "@/lib/tiptap/read-only-extensions";
import { normalizeRichField } from "@/lib/tiptap/rich-text";

export function ImproveAiReadonlyRichText({
  doc,
  className,
}: {
  doc: JSONContent;
  className?: string;
}) {
  const content = useMemo(() => normalizeRichField(doc), [doc]);
  const extensions = useMemo(() => createReadOnlyRichTextExtensions(), []);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content,
      editable: false,
    },
    [extensions]
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const next = normalizeRichField(doc);
    editor.commands.setContent(next, { emitUpdate: false });
  }, [doc, editor]);

  return (
    <div
      className={cn(
        "improve-ai-readonly-rich-text rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]",
        "[&_.ProseMirror]:min-h-0 [&_.ProseMirror]:outline-none [&_.ProseMirror]:cursor-default",
        className
      )}
    >
      {editor ? <EditorContent editor={editor} /> : null}
    </div>
  );
}
