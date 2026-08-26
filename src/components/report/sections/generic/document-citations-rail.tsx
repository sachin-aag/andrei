"use client";

import {
  citationSourceElementId,
  scrollToCitationMarker,
} from "@/lib/suggestions/navigate-citation";
import type { ParkedCitation } from "@/lib/suggestions/citations-at-end";

export function DocumentCitationsRail({
  citations,
}: {
  citations: readonly ParkedCitation[];
}) {
  return (
    <aside
      className="generic-citations-rail sticky top-4 w-72 shrink-0"
      aria-label="Citations"
    >
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <h3 className="border-b border-[var(--border)] px-3 py-2 text-xs font-semibold tracking-wide text-[var(--muted-foreground)] uppercase">
          Citations
        </h3>
        {citations.length === 0 ? (
          <p className="px-3 py-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
            Numbered sources will appear here. Claims in the document keep a
            small bubble; full filenames live at the end of the page.
          </p>
        ) : (
          <ol className="max-h-[min(70vh,36rem)] space-y-1 overflow-auto p-2">
            {citations.map((citation) => (
              <li key={citation.number}>
                <button
                  type="button"
                  id={citationSourceElementId(citation.number)}
                  className="citation-source-item flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm leading-snug hover:bg-[var(--secondary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                  onClick={() => scrollToCitationMarker(citation.number)}
                >
                  <span className="citation-source-index mt-0.5" aria-hidden>
                    {citation.number}
                  </span>
                  <span className="min-w-0 break-words text-[var(--foreground)]">
                    {citation.source}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
