"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";

export type DocumentRevisionSummary = {
  id: string;
  revisionNo: number;
  source: string;
  summary: string;
  createdAt: string;
  updatedAt?: string;
  createdBy: string | null;
};

function revisionSourceLabel(source: string): string {
  switch (source) {
    case "agent_turn":
      return "Agent";
    case "manual":
      return "Edits";
    default:
      return "Edits";
  }
}

export function DocumentRevisionHistory({
  reportId,
  compare,
  onCompare,
  onExitCompare,
  surface = "report",
}: {
  reportId: string;
  compare: { from: number; to: number } | null;
  onCompare: (range: { from: number; to: number }) => void;
  onExitCompare: () => void;
  surface?: "report" | "analytics";
}) {
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState<DocumentRevisionSummary[]>([]);
  const [fromNo, setFromNo] = useState<number | null>(null);
  const [toNo, setToNo] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const revisionsHref =
    surface === "analytics"
      ? `/api/reports/${reportId}/analytics/revisions`
      : `/api/reports/${reportId}/revisions`;
  const historyTestId =
    surface === "analytics"
      ? "analytics-revision-history"
      : "document-revision-history";
  const compareTestId =
    surface === "analytics"
      ? "analytics-revision-compare"
      : "document-revision-compare";
  const emptyCopy =
    surface === "analytics"
      ? "Versions appear after you edit the worksheet or the assistant writes to it."
      : "Versions appear after you edit the document or the assistant writes to it.";

  const load = useCallback(async () => {
    try {
      const res = await fetch(revisionsHref);
      if (!res.ok) return;
      const data = (await res.json()) as { revisions?: DocumentRevisionSummary[] };
      const next = Array.isArray(data.revisions) ? data.revisions : [];
      setRevisions(next);
      if (next.length >= 2) {
        setFromNo(next[next.length - 2]!.revisionNo);
        setToNo(next[next.length - 1]!.revisionNo);
      }
    } catch {
      setRevisions([]);
    }
  }, [revisionsHref]);

  const [prevHref, setPrevHref] = useState(revisionsHref);
  if (revisionsHref !== prevHref) {
    setPrevHref(revisionsHref);
    setRevisions([]);
    setFromNo(null);
    setToNo(null);
    setOpen(false);
  }

  const canCompare = useMemo(
    () =>
      fromNo != null &&
      toNo != null &&
      fromNo !== toNo &&
      revisions.some((row) => row.revisionNo === fromNo) &&
      revisions.some((row) => row.revisionNo === toNo),
    [fromNo, revisions, toNo]
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-testid={historyTestId}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void load();
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]",
          (open || compare) && "bg-[var(--secondary)] text-[var(--foreground)]"
        )}
      >
        <History className="size-3.5" />
        History
      </button>
      {open ? (
        <div
          data-testid={`${historyTestId}-menu`}
          className="absolute right-0 top-8 z-40 w-80 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 shadow-xl"
        >
          {revisions.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">{emptyCopy}</p>
          ) : (
            <>
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {revisions
                  .slice()
                  .reverse()
                  .map((row) => (
                    <li
                      key={row.id}
                      className="rounded-md border border-[var(--border)] px-2 py-1.5"
                    >
                      <p className="text-xs font-medium text-[var(--foreground)]">
                        Version {row.revisionNo}
                      </p>
                      <p className="text-[11px] text-[var(--muted-foreground)]">
                        {formatDistanceToNow(
                          new Date(row.updatedAt ?? row.createdAt),
                          { addSuffix: true }
                        )}
                        {" · "}
                        {revisionSourceLabel(row.source)}
                      </p>
                      {row.summary ? (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--muted-foreground)]">
                          {row.summary}
                        </p>
                      ) : null}
                    </li>
                  ))}
              </ul>
              {revisions.length >= 2 ? (
                <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-[var(--muted-foreground)]">
                      From
                      <select
                        className="ml-1 rounded border border-[var(--border)] bg-[var(--background)] px-1 py-0.5 text-xs"
                        value={fromNo ?? ""}
                        onChange={(event) =>
                          setFromNo(Number(event.currentTarget.value))
                        }
                      >
                        {revisions.map((row) => (
                          <option key={row.id} value={row.revisionNo}>
                            {row.revisionNo}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] text-[var(--muted-foreground)]">
                      To
                      <select
                        className="ml-1 rounded border border-[var(--border)] bg-[var(--background)] px-1 py-0.5 text-xs"
                        value={toNo ?? ""}
                        onChange={(event) =>
                          setToNo(Number(event.currentTarget.value))
                        }
                      >
                        {revisions.map((row) => (
                          <option key={row.id} value={row.revisionNo}>
                            {row.revisionNo}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    data-testid={compareTestId}
                    disabled={!canCompare}
                    onClick={() => {
                      if (!canCompare || fromNo == null || toNo == null) return;
                      onCompare({ from: fromNo, to: toNo });
                      setOpen(false);
                    }}
                    className="w-full rounded-md bg-[var(--primary)] px-2 py-1 text-xs font-medium text-[var(--primary-foreground)] disabled:opacity-50"
                  >
                    Compare
                  </button>
                  {compare ? (
                    <button
                      type="button"
                      onClick={() => {
                        onExitCompare();
                        setOpen(false);
                      }}
                      className="w-full rounded-md px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
                    >
                      Exit compare
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
