"use client";

import { useLayoutEffect, useRef } from "react";
import { useReportData } from "@/providers/report-provider";

/**
 * After chat/refresh hydrates a section from the server, treat that row as the
 * last persisted snapshot. Otherwise a local revert to the pre-hydrate value
 * (e.g. deleting a just-drafted Purpose) looks identical to the mount empty
 * and flush() skips the PATCH — chat then reads the stale filled DB row.
 *
 * The first `updatedAt` is the mount snapshot (`useAutoSave` already initialized
 * `lastPersisted` from `initialValue`). Later stamps are server refreshes.
 */
export function nextHydratedSectionStamp(
  previous: string | null,
  next: string | null
): { stamp: string | null; shouldMarkPersisted: boolean } {
  if (next == null) return { stamp: previous, shouldMarkPersisted: false };
  if (previous == null) return { stamp: next, shouldMarkPersisted: false };
  if (previous === next) return { stamp: previous, shouldMarkPersisted: false };
  return { stamp: next, shouldMarkPersisted: true };
}

export function useHydrateAutosaveFromSectionRow<T>(
  section: string,
  markPersisted: (next?: T) => void
) {
  const { sectionRows } = useReportData();
  const row = sectionRows.find((r) => r.section === section);
  const stamp = row?.updatedAt ?? null;
  const content = row?.content;
  const lastStampRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const next = nextHydratedSectionStamp(lastStampRef.current, stamp);
    lastStampRef.current = next.stamp;
    if (!next.shouldMarkPersisted) return;
    markPersisted(content as T);
  }, [stamp, content, markPersisted]);
}
