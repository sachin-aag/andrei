"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CHAT_IDENTITY_SECTION } from "@/lib/ai/chat/identity";
import {
  decideIdentityHydrate,
  shouldMarkIdentityHydratePersisted,
} from "@/lib/reports/identity-form-hydrate";
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
  const { registerSectionFlush } = useReportData();

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

  useLayoutEffect(() => {
    incomingRef.current = incoming;
    applyToReportRef.current = applyToReport;
    toPatchRef.current = toPatch;
    valueRef.current = value;
    markPersistedRef.current = markPersisted;
  }, [incoming, applyToReport, toPatch, value, markPersisted]);

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

  const hydrateIncoming = useCallback(
    (persist: boolean) => {
      const next = incomingRef.current;
      const key = serialize(next);
      valueRef.current = next;
      lastSeenUpdatedAtRef.current = reportUpdatedAt;
      setValue(next);
      if (!persist) return;
      persistKeyRef.current = key;
      markPersistedRef.current(next);
    },
    [reportUpdatedAt, serialize]
  );

  // Hydrate while an identity card pauses autosave — Apply's setReport must
  // land in the inputs before the overlay disappears with the resolved card.
  // Same-clock incoming (a delete that already called applyToReport) must
  // not markPersisted, or autosave thinks the shorter value is already saved.
  useLayoutEffect(() => {
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
    hydrateIncoming(
      shouldMarkIdentityHydratePersisted({
        incomingUpdatedAt: reportUpdatedAt,
        lastSeenUpdatedAt: lastSeenUpdatedAtRef.current,
      })
    );
  }, [hydrateIncoming, incomingSerialized, reportUpdatedAt, serialize]);

  return { value, update, status, lastSavedAt };
}
