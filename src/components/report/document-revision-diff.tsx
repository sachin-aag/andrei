"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  InlineDiffPart,
  InlineFieldDiff,
  InlineImageDiff,
  InlineSectionDiff,
} from "@/lib/document-revisions/inline-diff";

function DiffText({ parts }: { parts: InlineDiffPart[] }) {
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, index) => {
        if (part.type === "insert") {
          return (
            <span key={index} className="suggestion-insert">
              {part.value}
            </span>
          );
        }
        if (part.type === "delete") {
          return (
            <span key={index} className="suggestion-delete">
              {part.value}
            </span>
          );
        }
        return <span key={index}>{part.value}</span>;
      })}
    </span>
  );
}

function ImageDiffs({ images }: { images: InlineImageDiff[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {images.map((image, index) => {
        const added = image.change === "added";
        return (
          <figure
            key={`${image.change}-${image.src}-${index}`}
            className={cn(
              "max-w-56 space-y-1 rounded-md border p-2",
              added
                ? "border-[var(--border)] bg-[var(--secondary)]/40"
                : "border-[var(--border)] opacity-70"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- history figure previews */}
            <img
              src={image.src}
              alt={image.alt || (added ? "Added figure" : "Removed figure")}
              className="max-h-40 w-full object-contain"
            />
            <figcaption
              className={cn(
                "text-[11px]",
                added ? "suggestion-insert" : "suggestion-delete"
              )}
            >
              {added ? "Added" : "Removed"}
              {image.alt ? ` · ${image.alt}` : ""}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function FieldDiff({ field }: { field: InlineFieldDiff }) {
  switch (field.kind) {
    case "table":
      return field.table ? (
        <table className="w-full border-collapse text-sm">
          <tbody>
            {field.table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={cn(
                      "border border-[var(--border)] px-2 py-1 align-top",
                      cell.parts.some((part) => part.type !== "equal") &&
                        "bg-[var(--secondary)]/60"
                    )}
                  >
                    <DiffText parts={cell.parts} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null;
    case "images":
      return <ImageDiffs images={field.images ?? []} />;
    case "text":
      return (
        <p className="text-sm text-[var(--foreground)]">
          <DiffText parts={field.parts ?? []} />
        </p>
      );
    default: {
      const exhaustive: never = field.kind;
      return exhaustive;
    }
  }
}

export function DocumentRevisionDiff({
  reportId,
  from,
  to,
  onExit,
}: {
  reportId: string;
  from: number;
  to: number;
  onExit: () => void;
}) {
  const [sections, setSections] = useState<InlineSectionDiff[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      setSections(null);
      try {
        const res = await fetch(
          `/api/reports/${reportId}/revisions/diff?from=${from}&to=${to}`
        );
        const data = (await res.json()) as {
          error?: string;
          sections?: InlineSectionDiff[];
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not compare these versions.");
          return;
        }
        setSections(data.sections ?? []);
      } catch {
        if (!cancelled) setError("Could not compare these versions.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, reportId, to]);

  return (
    <div
      data-testid="document-revision-diff"
      className="flex min-h-0 flex-1 flex-col overflow-auto px-6 py-4"
    >
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/50 px-3 py-2">
        <p className="text-sm font-medium text-[var(--foreground)]">
          Comparing version {from} → version {to}
        </p>
        <button
          type="button"
          data-testid="document-revision-diff-exit"
          onClick={onExit}
          className="rounded-md px-2 py-1 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-[var(--foreground)]"
        >
          Exit
        </button>
      </div>
      {error ? (
        <p className="text-sm text-[var(--muted-foreground)]">{error}</p>
      ) : sections == null ? (
        <p className="text-sm text-[var(--muted-foreground)]">Loading differences…</p>
      ) : sections.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No differences.</p>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.section} className="space-y-3">
              <h2 className="text-sm font-semibold text-[var(--foreground)]">
                {section.label}
              </h2>
              {section.fields.map((field, index) => (
                <div
                  key={`${field.targetField}-${field.kind}-${index}`}
                  className="space-y-1"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                    {field.targetField}
                  </p>
                  <FieldDiff field={field} />
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
