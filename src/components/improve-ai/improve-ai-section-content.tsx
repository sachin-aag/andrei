"use client";

import type { ImproveAiDisplayBlock } from "@/lib/improve-ai/section-display-blocks";
import { ImproveAiReadonlyRichText } from "@/components/improve-ai/improve-ai-readonly-rich-text";

export function ImproveAiSectionContent({
  blocks,
  className,
}: {
  blocks: ImproveAiDisplayBlock[];
  className?: string;
}) {
  if (blocks.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">No section content.</p>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        {blocks.map((block, index) => (
          <div key={`${index}-${block.label}`} className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              {block.label}
            </h3>
            {block.kind === "rich" ? (
              <ImproveAiReadonlyRichText doc={block.doc} />
            ) : (
              <div className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-[var(--foreground)]">
                {block.text}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
