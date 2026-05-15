import { useState } from "react";
import { FileQuestion, ArrowRight, CheckCircle2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  useReportEditors,
  useReportPlaceholders,
} from "@/providers/report-provider";
import { SECTION_LABELS } from "@/types/sections";
import type { SectionType } from "@/db/schema";
import type { Placeholder } from "@/lib/placeholders/find";
import { fillPlaceholder } from "@/lib/placeholders/fill";

/** Try to extract a human-readable field label from placeholder text like `[Batch No.: <to be filled>]` */
function extractLabel(text: string): string {
  // Strip outer brackets
  let inner = text.replace(/^\[/, "").replace(/\]$/, "").trim();
  // Strip `<to be filled>` / `to be filled` suffix
  inner = inner.replace(/<?\s*to be filled\s*>?/gi, "").trim();
  // Strip trailing colon/dash
  inner = inner.replace(/[:\-]+\s*$/, "").trim();
  return inner || text;
}

export function PlaceholdersPanel({
  onJumpToSection,
}: {
  onJumpToSection: (section: SectionType) => void;
}) {
  const [open, setOpen] = useState(false);
  const { pendingPlaceholders } = useReportPlaceholders();
  const { getEditor } = useReportEditors();
  const [fillValues, setFillValues] = useState<Record<string, string>>({});

  const grouped = pendingPlaceholders.reduce((acc, p) => {
    if (!acc[p.section]) acc[p.section] = [];
    acc[p.section].push(p);
    return acc;
  }, {} as Record<string, Placeholder[]>);

  const handleJump = (p: Placeholder) => {
    setOpen(false);
    onJumpToSection(p.section);
    requestAnimationFrame(() => {
      const editor = getEditor(p.section, p.contentPath);
      if (editor) {
        editor.chain().focus().setTextSelection({ from: p.fromPos, to: p.toPos }).run();
      }
    });
  };

  const handleFill = (p: Placeholder) => {
    const value = fillValues[p.id]?.trim();
    if (!value) return;
    const editor = getEditor(p.section, p.contentPath);
    if (!editor) return;
    const success = fillPlaceholder(editor, p, value);
    if (success) {
      setFillValues((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
    }
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {Object.entries(grouped).map(([s, list]) => {
            const section = s as SectionType;
            return (
              <div key={section} className="space-y-3">
                <h3 className="font-semibold text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                  {SECTION_LABELS[section] ?? section}
                </h3>
                <div className="space-y-2">
                  {list.map((p) => {
                    const label = extractLabel(p.text);

                    // Build surrounding context
                    const editor = getEditor(p.section, p.contentPath);
                    let beforeCtx = "";
                    let afterCtx = "";
                    if (editor) {
                      const doc = editor.state.doc;
                      const from = Math.max(0, p.fromPos - 50);
                      const to = Math.min(doc.content.size, p.toPos + 50);
                      beforeCtx = doc.textBetween(from, p.fromPos, " ");
                      afterCtx = doc.textBetween(p.toPos, to, " ");
                    }

                    return (
                      <div
                        key={p.id}
                        className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden"
                      >
                        {/* Header: field label + jump button */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/60 border-b border-amber-100">
                          <PenLine className="size-3.5 text-amber-600 shrink-0" />
                          <span className="flex-1 min-w-0 text-xs font-medium text-amber-800 truncate">
                            {label}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleJump(p)}
                            className="text-[10px] font-medium text-amber-600 hover:text-amber-800 flex items-center gap-0.5 shrink-0 transition-colors"
                            title="Jump to placeholder in editor"
                          >
                            Jump
                            <ArrowRight className="size-3" />
                          </button>
                        </div>

                        {/* Context: surrounding text with placeholder highlighted */}
                        <div className="px-3 py-2 text-xs text-[var(--muted-foreground)] leading-relaxed">
                          {beforeCtx && <span>{beforeCtx}</span>}
                          <span className="inline-block px-1 mx-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium">
                            {p.text}
                          </span>
                          {afterCtx && <span>{afterCtx}</span>}
                        </div>

                        {/* Fill input */}
                        <div className="flex items-center gap-2 px-3 pb-2.5">
                          <Input
                            value={fillValues[p.id] ?? ""}
                            onChange={(e) =>
                              setFillValues((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleFill(p);
                              }
                            }}
                            placeholder={"Enter value\u2026"}
                            className="h-7 text-xs flex-1"
                          />
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 text-xs px-3"
                            disabled={!fillValues[p.id]?.trim()}
                            onClick={() => handleFill(p)}
                          >
                            Fill
                          </Button>
                        </div>
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
                You&apos;re all caught up!
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
