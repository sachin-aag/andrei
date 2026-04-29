import { useState } from "react";
import { FileQuestion, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useReport } from "@/providers/report-provider";
import { SECTION_LABELS } from "@/types/sections";
import type { SectionType } from "@/db/schema";
import type { Placeholder } from "@/lib/placeholders/find";

export function PlaceholdersPanel({
  onJumpToSection,
}: {
  onJumpToSection: (section: SectionType) => void;
}) {
  const [open, setOpen] = useState(false);
  const { pendingPlaceholders, getEditor } = useReport();

  const grouped = pendingPlaceholders.reduce((acc, p) => {
    if (!acc[p.section]) acc[p.section] = [];
    acc[p.section].push(p);
    return acc;
  }, {} as Record<string, Placeholder[]>);

  const handleJump = (p: Placeholder) => {
    setOpen(false);
    onJumpToSection(p.section);
    // Give the layout a frame to scroll, then focus and select the text
    requestAnimationFrame(() => {
      const editor = getEditor(p.section, p.contentPath);
      if (editor) {
        editor.chain().focus().setTextSelection({ from: p.fromPos, to: p.toPos }).run();
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <FileQuestion className="size-4" />
          <span className="hidden sm:inline">Placeholders</span>
          {pendingPlaceholders.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white shadow-sm ring-1 ring-background">
              {pendingPlaceholders.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px] flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b border-[var(--border)] shrink-0">
          <SheetTitle className="text-lg flex items-center gap-2">
            <FileQuestion className="size-5 text-amber-500" />
            Pending Placeholders
          </SheetTitle>
          <SheetDescription className="text-sm">
            {pendingPlaceholders.length === 0
              ? "All placeholders have been filled. Great job!"
              : `You have ${pendingPlaceholders.length} placeholder${
                  pendingPlaceholders.length === 1 ? "" : "s"
                } left to fill in before this report is complete.`}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {Object.entries(grouped).map(([s, list]) => {
            const section = s as SectionType;
            return (
              <div key={section} className="space-y-3">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-[var(--muted-foreground)]">
                  {SECTION_LABELS[section] ?? section}
                </h3>
                <div className="space-y-2">
                  {list.map((p) => {
                    // Extract a bit of context around the placeholder from the editor
                    const editor = getEditor(p.section, p.contentPath);
                    let contextStr = p.text;
                    if (editor) {
                      const doc = editor.state.doc;
                      const from = Math.max(0, p.fromPos - 40);
                      const to = Math.min(doc.content.size, p.toPos + 40);
                      contextStr = doc.textBetween(from, to, " ");
                      // Replace the actual placeholder with a bold pill for preview
                      contextStr = contextStr.replace(
                        p.text,
                        "[[**PLACEHOLDER**]]"
                      );
                    }

                    return (
                      <div
                        key={p.id}
                        className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:border-amber-400/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0 text-xs text-[var(--foreground)] leading-snug">
                          {contextStr.split("[[**PLACEHOLDER**]]").map((part, i, arr) => (
                            <span key={i}>
                              {part}
                              {i < arr.length - 1 && (
                                <span className="inline-block px-1 mx-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium">
                                  {p.text}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                          onClick={() => handleJump(p)}
                          title="Jump to placeholder"
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {pendingPlaceholders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="size-12 rounded-full bg-green-50 flex items-center justify-center mb-4">
                <CheckCircle2 className="size-6 text-green-600" />
              </div>
              <p className="text-sm font-medium text-[var(--foreground)]">
                You're all caught up!
              </p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1 max-w-[250px]">
                No placeholders found in the document.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Ensure CheckCircle2 is imported
import { CheckCircle2 } from "lucide-react";