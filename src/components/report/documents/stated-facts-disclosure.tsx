"use client";

import { useEffect, useState } from "react";

type StatedFactRow = {
  id: string;
  text?: string;
  sourceText: string;
  entityText?: string;
  valueText?: string;
  authorName: string;
  createdAt: string;
};

type LoadBody = {
  facts: StatedFactRow[];
  canDelete: boolean;
};

/**
 * Collapsed list of engineer-stated facts on this report. Hidden when empty.
 * Keyed by report id so a report switch cannot keep the previous list.
 */
export function StatedFactsDisclosure({
  reportId,
}: {
  reportId: string | undefined;
}) {
  const [loaded, setLoaded] = useState<{
    reportId: string;
    facts: StatedFactRow[];
    canDelete: boolean;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!reportId) return;
    const ac = new AbortController();
    void fetch(`/api/reports/${reportId}/stated-facts`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("stated facts unavailable");
        return (await res.json()) as LoadBody;
      })
      .then((body) => {
        if (ac.signal.aborted) return;
        setLoaded({
          reportId,
          facts: Array.isArray(body.facts) ? body.facts : [],
          canDelete: body.canDelete === true,
        });
      })
      .catch(() => {
        if (!ac.signal.aborted) {
          setLoaded({ reportId, facts: [], canDelete: false });
        }
      });
    return () => ac.abort();
  }, [reportId]);

  if (!reportId) return null;

  const showing = loaded && loaded.reportId === reportId ? loaded : null;
  const facts = showing?.facts ?? null;
  const canDelete = showing?.canDelete === true;

  if (!facts || facts.length === 0) return null;

  async function remove(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/reports/${reportId}/stated-facts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      setLoaded((current) => {
        if (!current || current.reportId !== reportId) return current;
        return {
          ...current,
          facts: current.facts.filter((fact) => fact.id !== id),
        };
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <details
      data-testid="stated-facts"
      className="shrink-0 border-t border-[var(--border)]"
    >
      <summary className="cursor-pointer px-3 py-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
        Stated facts ({facts.length})
      </summary>
      <ul className="max-h-40 space-y-2 overflow-y-auto px-3 pb-2">
        {facts.map((fact) => {
          const label =
            fact.sourceText.trim() ||
            fact.text?.trim() ||
            (fact.entityText
              ? `${fact.entityText}: ${fact.valueText ?? ""}`
              : fact.valueText ?? "");
          return (
            <li key={fact.id} className="text-[11px] leading-snug">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[var(--foreground)]">{label}</span>
                {canDelete ? (
                  <button
                    type="button"
                    className="shrink-0 text-[var(--muted-foreground)] underline-offset-2 hover:underline disabled:opacity-50"
                    aria-label={`Delete stated fact ${label}`}
                    disabled={deletingId === fact.id}
                    onClick={() => void remove(fact.id)}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              <p className="text-[var(--muted-foreground)]">
                {fact.authorName}
                {" · "}
                {formatWhen(fact.createdAt)}
              </p>
              {fact.sourceText && fact.sourceText.trim() !== label ? (
                <p className="text-[var(--muted-foreground)]">{fact.sourceText}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
