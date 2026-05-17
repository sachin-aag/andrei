"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionShell } from "./section-shell";
import { useReportData, useReportSection } from "@/providers/report-provider";
import { useSectionSave } from "@/hooks/use-section-save";

export function AttachmentsEditor() {
  const { readOnly } = useReportData();
  const { update } = useReportSection("attachments");
  const { status, lastSavedAt, value } = useSectionSave("attachments");

  return (
    <SectionShell
      title="Attachments"
      description="Optional annexes (work order copies, audit trails, justification memos, etc.), matching the “List of attachment” block in the exported report."
      status={status}
      lastSavedAt={lastSavedAt}
    >
      <div className="space-y-6">
        {value.items.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">
            No attachments listed. Add a row for each appendix referenced in the
            investigation packet.
          </p>
        )}
        {value.items.map((item, idx) => (
          <div
            key={idx}
            className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--secondary)]/40 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">
                Attachment {idx + 1}
              </span>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-[var(--muted-foreground)]"
                  aria-label={`Remove attachment ${idx + 1}`}
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
            <div className="grid gap-1.5">
              <Label className="text-xs">Label (optional)</Label>
              <Input
                value={item.label}
                disabled={readOnly}
                placeholder="e.g. Attachment No. I"
                onChange={(e) =>
                  update((prev) => ({
                    ...prev,
                    items: prev.items.map((row, i) =>
                      i === idx ? { ...row, label: e.target.value } : row
                    ),
                  }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={item.description}
                disabled={readOnly}
                className="min-h-[72px]"
                placeholder="Short title or reference for this appendix"
                onChange={(e) =>
                  update((prev) => ({
                    ...prev,
                    items: prev.items.map((row, i) =>
                      i === idx ? { ...row, description: e.target.value } : row
                    ),
                  }))
                }
              />
            </div>
          </div>
        ))}
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              update((prev) => ({
                ...prev,
                items: [...prev.items, { label: "", description: "" }],
              }))
            }
          >
            <Plus className="size-3.5" />
            Add attachment
          </Button>
        )}
      </div>
    </SectionShell>
  );
}
