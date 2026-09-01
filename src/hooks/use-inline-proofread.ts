"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";
import type { ProofreadIssue, ProofreadResult } from "@/lib/ai/proofread/types";
import {
  collectProofreadUnits,
  dirtyProofreadUnits,
  type ProofreadFieldUnit,
} from "@/lib/proofread/units";

export const PROOFREAD_DEBOUNCE_MS = 1200;

type Cache = Map<string, ProofreadIssue[]>;

function visibleIssues(
  units: ProofreadFieldUnit[],
  cache: Cache,
  dismissed: Set<string>
): ProofreadIssue[] {
  const next: ProofreadIssue[] = [];
  for (const unit of units) {
    const cached = cache.get(unit.hash) ?? [];
    for (const issue of cached) {
      if (!dismissed.has(issue.id)) next.push(issue);
    }
  }
  return next;
}

export function useInlineProofread({
  reportId,
  section,
  contentPath,
  doc,
  enabled,
}: {
  reportId: string;
  section: SectionType;
  contentPath: string;
  doc: JSONContent;
  enabled: boolean;
}) {
  const [issues, setIssues] = useState<ProofreadIssue[]>([]);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const cacheRef = useRef<Cache>(new Map());
  const dismissedRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const units = useMemo(() => collectProofreadUnits(doc), [doc]);

  const publishIssues = useCallback((nextUnits: ProofreadFieldUnit[]) => {
    setIssues(visibleIssues(nextUnits, cacheRef.current, dismissedRef.current));
  }, []);

  useEffect(() => {
    publishIssues(units);
  }, [units, publishIssues]);

  const dismissIssue = useCallback(
    (id: string) => {
      dismissedRef.current.add(id);
      setActiveIssueId((current) => (current === id ? null : current));
      publishIssues(units);
    },
    [publishIssues, units]
  );

  const activateIssue = useCallback((id: string) => {
    setActiveIssueId(id || null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const dirty = dirtyProofreadUnits(units, new Set(cacheRef.current.keys()));
    if (timerRef.current) clearTimeout(timerRef.current);
    if (dirty.length === 0) return;

    timerRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const payloadUnits = dirty.slice(0, 6).map((unit) => ({
        id: unit.id,
        text: unit.text,
      }));
      void fetch(`/api/reports/${reportId}/proofread`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          contentPath,
          units: payloadUnits,
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) return;
          const body = (await res.json()) as ProofreadResult;
          const byUnit = new Map<string, ProofreadIssue[]>();
          for (const issue of body.issues ?? []) {
            const list = byUnit.get(issue.unitId) ?? [];
            list.push(issue);
            byUnit.set(issue.unitId, list);
          }
          for (const unit of dirty.slice(0, 6)) {
            cacheRef.current.set(unit.hash, byUnit.get(unit.id) ?? []);
          }
          publishIssues(units);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          if (error instanceof Error && error.name === "AbortError") return;
        });
    }, PROOFREAD_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [units, enabled, reportId, section, contentPath, publishIssues]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    issues,
    activeIssueId,
    activateIssue,
    dismissIssue,
  };
}
