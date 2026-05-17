"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionShell } from "./section-shell";
import { useReportData, useReportSection } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";

export function DocumentsReviewedEditor() {
  const { readOnly } = useReportData();
  const { update } = useReportSection("documents_reviewed");
  const { status, lastSavedAt, value } = useSectionSave("documents_reviewed");

  return (
    <SectionShell
      title={SECTION_TITLE}
      description="SOPs, forms, or other records cited as reviewed for this investigation (numbered list, as in the Word template)."
      status={status}
      lastSavedAt={lastSavedAt}
    >
      <div className="space-y-3">
        {value.items.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">
            No documents listed yet. Add a row for each reviewed record.
          </p>
        )}
        <ol className="space-y-2 list-decimal list-outside pl-6">
          {value.items.map((item, idx) => (
            <li key={idx} className="pl-1">
              <div className="flex gap-2 items-start">
                <Input
                  value={item}
                  disabled={readOnly}
                  className="min-w-0 flex-1"
                  placeholder="e.g. SOP/DP/PK/013 — operation and cleaning procedure"
                  onChange={(e) =>
                    update((prev) => ({
                      ...prev,
                      items: prev.items.map((line, i) =>
                        i === idx ? e.target.value : line
                      ),
                    }))
                  }
                />
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 size-8 text-[var(--muted-foreground)]"
                    aria-label={`Remove document ${idx + 1}`}
                    onClick={() =>
                      update((prev) => ({
                        ...prev,
                        items: prev.items.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              update((prev) => ({ ...prev, items: [...prev.items, ""] }))
            }
          >
            <Plus className="size-3.5" />
            Add document
          </Button>
        )}
      </div>
    </SectionShell>
  );
}

const SECTION_TITLE = "Documents reviewed";
