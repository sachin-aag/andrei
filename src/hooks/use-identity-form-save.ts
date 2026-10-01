"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CHAT_IDENTITY_SECTION } from "@/lib/ai/chat/identity";
import { decideIdentityHydrate } from "@/lib/reports/identity-form-hydrate";
import { useIdentitySavePaused } from "@/components/report/identity-suggestion-field";
import { useReportData } from "@/providers/report-provider";
import { useAutoSave, type AutoSaveContext } from "@/hooks/use-auto-save";
import type { ReportRecord } from "@/types/report";
import type { SectionType } from "@/db/schema";

export async function patchIdentityReport(
  reportId: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<{ report?: ReportRecord }> {
  const res = await fetch(`/api/reports/${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error("Save failed");
  return (await res.json().catch(() => ({}))) as { report?: ReportRecord };
}

export function useIdentityFormSave<T>(opts: {
  reportId: string;
  reportUpdatedAt: string;
  readOnly: boolean;
  incoming: T;
  toPatch: (value: T) => Record<string, unknown>;
  applyToReport: (value: T) => void;
}): {
  value: T;
  update: (updater: (prev: T) => T) => void;
  status: ReturnType<typeof useAutoSave>["status"];
  lastSavedAt: Date | null;
} {
  const { reportId, reportUpdatedAt, readOnly, incoming, toPatch, applyToReport } =
    opts;
  const serialize = useCallback((v: T) => JSON.stringify(v), []);
  const [value, setValue] = useState(incoming);
  const valueRef = useRef(value);
  const incomingRef = useRef(incoming);
  const applyToReportRef = useRef(applyToReport);
  const toPatchRef = useRef(toPatch);
  const persistKeyRef = useRef(serialize(incoming));
  const lastSeenUpdatedAtRef = useRef(reportUpdatedAt);
  const pauseSave = useIdentitySavePaused();
  const wasPausedRef = useRef(pauseSave);
  const { registerSectionFlush } = useReportData();

  incomingRef.current = incoming;
  applyToReportRef.current = applyToReport;
  toPatchRef.current = toPatch;
  valueRef.current = value;

  const onSave = useCallback(
    async (v: T, context?: AutoSaveContext) => {
      const data = await patchIdentityReport(
        reportId,
        toPatchRef.current(v),
        context?.signal
      );
      persistKeyRef.current = serialize(v);
      if (data.report?.updatedAt) {
        lastSeenUpdatedAtRef.current = data.report.updatedAt;
      }
    },
    [reportId, serialize]
  );

  const { status, lastSavedAt, flush, needsFlush, markPersisted } = useAutoSave({
    enabled: !readOnly && !pauseSave,
    persistOnLeave: !readOnly,
    value,
    onSave,
  });
  const markPersistedRef = useRef(markPersisted);
  markPersistedRef.current = markPersisted;

  useEffect(
    () =>
      registerSectionFlush(
        CHAT_IDENTITY_SECTION as SectionType,
        flush,
        needsFlush
      ),
    [flush, needsFlush, registerSectionFlush]
  );

  const update = useCallback((updater: (prev: T) => T) => {
    const next = updater(valueRef.current);
    valueRef.current = next;
    setValue(next);
    applyToReportRef.current(next);
  }, []);

  const incomingSerialized = serialize(incoming);

  const hydrateIncoming = useCallback(() => {
    const next = incomingRef.current;
    const key = serialize(next);
    valueRef.current = next;
    persistKeyRef.current = key;
    lastSeenUpdatedAtRef.current = reportUpdatedAt;
    setValue(next);
    markPersistedRef.current(next);
  }, [reportUpdatedAt, serialize]);

  useLayoutEffect(() => {
    if (wasPausedRef.current && !pauseSave) {
      hydrateIncoming();
    }
    wasPausedRef.current = pauseSave;
  }, [hydrateIncoming, pauseSave]);

  useLayoutEffect(() => {
    // An open identity card / Apply transition owns the snapshot. Do not copy
    // a GET over keystrokes or fight Apply; falling-edge hydrates instead.
    if (pauseSave) return;
    const decision = decideIdentityHydrate({
      incomingSerialized,
      localSerialized: serialize(valueRef.current),
      lastPersistedSerialized: persistKeyRef.current,
      incomingUpdatedAt: reportUpdatedAt,
      lastSeenUpdatedAt: lastSeenUpdatedAtRef.current,
    });
    if (decision === "skip") {
      if (
        reportUpdatedAt &&
        (!lastSeenUpdatedAtRef.current ||
          reportUpdatedAt > lastSeenUpdatedAtRef.current)
      ) {
        lastSeenUpdatedAtRef.current = reportUpdatedAt;
      }
      return;
    }
    if (decision === "restore") {
      applyToReportRef.current(valueRef.current);
      return;
    }
    hydrateIncoming();
  }, [
    hydrateIncoming,
    incomingSerialized,
    pauseSave,
    reportUpdatedAt,
    serialize,
  ]);

  return { value, update, status, lastSavedAt };
}
