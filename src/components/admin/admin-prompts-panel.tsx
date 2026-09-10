"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { AdminDocumentPromptCatalog } from "@/lib/admin/document-prompts";

function scrollBlockIntoView(container: HTMLElement | null, blockId: string) {
  if (!container) return;
  const target = container.querySelector<HTMLElement>(`#prompt-${blockId}`);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function AdminPromptsPanel({
  catalogs,
}: {
  catalogs: AdminDocumentPromptCatalog[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedType, setSelectedType] = useState(
    () => catalogs[0]?.documentType ?? ""
  );
  const [jumpTarget, setJumpTarget] = useState("");

  const catalog = useMemo(
    () => catalogs.find((c) => c.documentType === selectedType) ?? catalogs[0],
    [catalogs, selectedType]
  );

  const handleJump = useCallback(
    (blockId: string) => {
      if (!blockId) return;
      setJumpTarget(blockId);
      scrollBlockIntoView(scrollRef.current, blockId);
    },
    []
  );

  if (!catalog || catalogs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-10 text-sm text-[var(--muted-foreground)]">
        No document templates are enabled for this deployment.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--border)] px-10 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Prompts</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">
          Read-only view of AI Check, chat, and suggestion prompts for each
          document template enabled on this deployment.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {catalogs.map((item) => (
            <button
              key={item.documentType}
              type="button"
              onClick={() => {
                setSelectedType(item.documentType);
                setJumpTarget("");
              }}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
                item.documentType === catalog.documentType
                  ? "border-[var(--brand-700)] bg-[var(--brand-700)] text-white"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--secondary)]"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label
            htmlFor="prompt-jump"
            className="text-sm font-medium text-[var(--foreground)]"
          >
            Jump to
          </label>
          <select
            id="prompt-jump"
            value={jumpTarget}
            onChange={(e) => handleJump(e.target.value)}
            className="min-w-[min(100%,20rem)] rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          >
            <option value="">Select a prompt…</option>
            {catalog.blocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.title}
              </option>
            ))}
          </select>
          <span className="text-xs text-[var(--muted-foreground)]">
            Eval {catalog.versions.eval} · Chat {catalog.versions.chat} ·
            Suggest {catalog.versions.suggest}
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-10 py-6">
        <div className="mx-auto max-w-4xl space-y-8 pb-12">
          {catalog.blocks.map((block) => (
            <section
              key={block.id}
              id={`prompt-${block.id}`}
              className="scroll-mt-6 rounded-lg border border-[var(--border)] bg-[var(--card)]"
            >
              <header className="border-b border-[var(--border)] px-5 py-4">
                <h2 className="text-base font-semibold text-[var(--foreground)]">
                  {block.title}
                </h2>
                {block.subtitle ? (
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {block.subtitle}
                  </p>
                ) : null}
              </header>
              <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-xs leading-relaxed text-[var(--foreground)]">
                {block.body}
              </pre>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
