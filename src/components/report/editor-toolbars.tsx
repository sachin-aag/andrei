"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  ImageIcon,
  List,
  ListOrdered,
  Palette,
  TableIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FONT_COLOR_PRESETS,
  normalizeColorInputValue,
} from "@/lib/tiptap/text-color";
import {
  MAX_IMAGES_PER_SECTION,
  compressImageFile,
  countImagesInDoc,
} from "@/lib/images/compress-image";
import { toast } from "sonner";

/** Re-render toolbar when selection or doc changes so active states stay in sync. */
export function useEditorToolbarState(editor: Editor | null) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const update = () => setTick((n) => n + 1);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);
}

export function TextFormatToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant={editor.isActive("bold") ? "secondary" : "ghost"}
        size="sm"
        className={cn("h-6 w-6 px-0 text-xs font-bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
        aria-label="Bold"
      >
        B
      </Button>
      <Button
        type="button"
        variant={editor.isActive("italic") ? "secondary" : "ghost"}
        size="sm"
        className={cn("h-6 w-6 px-0 text-xs italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
        aria-label="Italic"
      >
        I
      </Button>
      <Button
        type="button"
        variant={editor.isActive("underline") ? "secondary" : "ghost"}
        size="sm"
        className={cn("h-6 w-6 px-0 text-xs underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline"
        aria-label="Underline"
      >
        U
      </Button>
    </div>
  );
}

function activeTextColor(editor: Editor): string | undefined {
  const color = editor.getAttributes("textStyle").color;
  return typeof color === "string" && color.trim() ? color : undefined;
}

export function FontColorToolbar({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const currentColor = activeTextColor(editor);
  const colorInputValue = normalizeColorInputValue(currentColor);

  const applyColor = (color: string) => {
    if (color.toLowerCase() === "#000000") {
      editor.chain().focus().unsetColor().run();
      return;
    }
    editor.chain().focus().setColor(color).run();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={panelRef} className="relative flex items-center">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 w-fit gap-1 px-1.5 text-[10px] text-[var(--muted-foreground)]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Text color"
      >
        <Palette className="size-3" aria-hidden="true" />
        Color
        <span
          className="size-3.5 rounded-sm border border-[var(--border)]"
          style={{ backgroundColor: colorInputValue }}
          aria-hidden
        />
      </Button>
      {open ? (
        <div
          className="absolute left-0 top-full z-20 mt-1 flex flex-wrap items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-1 shadow-sm"
          role="menu"
        >
          {FONT_COLOR_PRESETS.map(({ label, value }) => {
            const isActive =
              currentColor?.toLowerCase() === value.toLowerCase();
            return (
              <button
                key={value}
                type="button"
                title={label}
                aria-label={`${label} text color`}
                role="menuitem"
                className={cn(
                  "size-4 rounded-sm border border-[var(--border)]",
                  isActive && "ring-1 ring-[var(--ring)] ring-offset-1"
                )}
                style={{ backgroundColor: value }}
                onClick={() => applyColor(value)}
              />
            );
          })}
          <label
            className="relative flex size-6 cursor-pointer items-center justify-center rounded-sm border border-[var(--border)]"
            title="Custom color"
          >
            <input
              type="color"
              value={colorInputValue}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              onChange={(e) => applyColor(e.target.value)}
              aria-label="Custom text color"
            />
            <span
              className="size-3.5 rounded-sm border border-[var(--border)]"
              style={{ backgroundColor: colorInputValue }}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] text-[var(--muted-foreground)]"
            onClick={() => editor.chain().focus().unsetColor().run()}
            title="Reset text color"
          >
            Reset
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function DashListIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="4" y1="6" x2="7" y2="6" />
      <line x1="10" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="7" y2="12" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="7" y2="18" />
      <line x1="10" y1="18" x2="20" y2="18" />
    </svg>
  );
}

export function ListEditToolbar({ editor }: { editor: Editor }) {
  const toggleBulletStyle = (listStyle: "disc" | "dash") => {
    if (editor.isActive("bulletList", { listStyle })) {
      editor.chain().focus().liftListItem("listItem").run();
      return;
    }
    editor
      .chain()
      .focus()
      .toggleBulletList()
      .updateAttributes("bulletList", { listStyle })
      .run();
  };

  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
        size="sm"
        className="h-6 px-1.5 text-xs"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        <ListOrdered className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant={
          editor.isActive("bulletList", { listStyle: "disc" }) ? "secondary" : "ghost"
        }
        size="sm"
        className="h-6 px-1.5 text-xs"
        onClick={() => toggleBulletStyle("disc")}
        title="Bullet list"
      >
        <List className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant={
          editor.isActive("bulletList", { listStyle: "dash" }) ? "secondary" : "ghost"
        }
        size="sm"
        className="h-6 px-1.5 text-xs"
        onClick={() => toggleBulletStyle("dash")}
        title="Dash list"
      >
        <DashListIcon className="size-3.5" />
      </Button>
    </div>
  );
}

export function InsertTableButton({ editor }: { editor: Editor }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 px-1.5 text-xs gap-1 text-[var(--muted-foreground)]"
      onClick={() =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run()
      }
    >
      <TableIcon className="size-3" />
      Insert Table
    </Button>
  );
}

export function InsertImageButton({ editor }: { editor: Editor }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImagePick = async (file: File | undefined) => {
    if (!file) return;
    const doc = editor.getJSON();
    if (countImagesInDoc(doc) >= MAX_IMAGES_PER_SECTION) {
      toast.error(`Maximum ${MAX_IMAGES_PER_SECTION} images per section.`);
      return;
    }
    try {
      const compressed = await compressImageFile(file);
      editor
        .chain()
        .focus()
        .insertImageInline({
          src: compressed.dataUrl,
          alt: file.name.replace(/\.[^.]+$/, ""),
          width: compressed.width,
        })
        .run();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not insert image.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-xs gap-1 text-[var(--muted-foreground)]"
        onClick={() => fileInputRef.current?.click()}
        title="Insert image"
      >
        <ImageIcon className="size-3.5" />
        Image
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void handleImagePick(e.target.files?.[0])}
      />
    </>
  );
}
