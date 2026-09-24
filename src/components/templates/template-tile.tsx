"use client";

import { templatePreviewLines, type DemoDocumentTemplate } from "@/lib/document-templates";
import { cn } from "@/lib/utils";

export function TemplateTile({
  template,
  onSelect,
}: {
  template: DemoDocumentTemplate;
  onSelect: (template: DemoDocumentTemplate) => void;
}) {
  const lines = templatePreviewLines(template);

  return (
    <button
      type="button"
      aria-label={template.title}
      onClick={() => onSelect(template)}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] text-left shadow-sm transition-colors",
        "hover:border-[var(--brand-500)] hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      )}
    >
      <div className="flex aspect-[4/3] items-center justify-center bg-[var(--secondary)] px-6 py-5">
        <div
          className="relative h-full w-[72%] overflow-hidden rounded-sm border border-[var(--border)] bg-white shadow-sm"
          aria-hidden="true"
        >
          <div className="absolute right-0 top-0 size-7 bg-[var(--secondary)] [clip-path:polygon(0_0,100%_0,100%_100%)]" />
          <div className="absolute right-0 top-0 size-7 border-b border-l border-[var(--border)] bg-[var(--card)] [clip-path:polygon(0_0,100%_100%,0_100%)]" />
          <div className="flex h-full flex-col gap-1.5 px-3 pb-3 pt-4">
            <div className="h-1 w-10 rounded-full bg-[var(--brand-500)]" />
            {lines.slice(0, 5).map((line) => (
              <p
                key={line}
                className="truncate text-[10px] leading-tight text-[var(--muted-foreground)]"
              >
                {line}
              </p>
            ))}
            <div className="mt-auto space-y-1">
              <div className="h-1 w-full rounded-full bg-[var(--border)]" />
              <div className="h-1 w-4/5 rounded-full bg-[var(--border)]" />
              <div className="h-1 w-2/3 rounded-full bg-[var(--border)]" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-4 py-3">
        <h3 className="text-sm font-semibold leading-snug tracking-tight text-[var(--foreground)]">
          {template.title}
        </h3>
        <p className="line-clamp-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
          {template.description}
        </p>
      </div>
    </button>
  );
}
