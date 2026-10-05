"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { UserRole } from "@/lib/auth/roles";
import type { ReportBundle } from "@/types/report";
import type { WorkspaceMode } from "@/providers/report-provider";
import { ReportProvider } from "@/providers/report-provider";
import { ReportWorkspaceLoading } from "@/components/report/report-workspace-loading";
import {
  normalizeWorkspaceBundle,
  workspaceLoadErrorMessage,
} from "@/components/report/report-workspace-bundle";

const ReportWorkspace = dynamic(
  () =>
    import("@/components/report/report-workspace").then(
      (mod) => mod.ReportWorkspace
    ),
  { ssr: false, loading: () => <ReportWorkspaceLoading /> }
);

/**
 * /edit used to stream the full bundle through the RSC client boundary.
 * Hydrating ReportWorkspace (every document-type editor) plus 18–25
 * section JSON docs kept the tab on "Loading report…" after HTTP 200 —
 * preview and local, not just production. Fetch the body after AppShell
 * paints so Home stays clickable.
 */
export function ReportWorkspaceLoader({
  reportId,
  currentUserId,
  currentUserRole,
  currentUserEmail,
  readOnly,
  workspaceMode,
  initialTrackChangesMode = false,
}: {
  reportId: string;
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserEmail: string;
  readOnly: boolean;
  workspaceMode: WorkspaceMode;
  initialTrackChangesMode?: boolean;
}) {
  const [bundle, setBundle] = useState<ReportBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    async function load() {
      try {
        // An editor must never hydrate from a cached body: autosave would
        // write the stale sections back over newer content.
        const res = await fetch(`/api/reports/${reportId}`, {
          signal: ac.signal,
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setError(workspaceLoadErrorMessage(res.status));
          return;
        }
        const data = (await res.json()) as ReportBundle;
        if (cancelled) return;
        setBundle(normalizeWorkspaceBundle(data));
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        setError("The report could not be loaded.");
      }
    }

    void load();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [reportId]);

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--muted-foreground)]">{error}</p>
      </div>
    );
  }

  if (!bundle) {
    return <ReportWorkspaceLoading />;
  }

  return (
    <ReportProvider
      bundle={bundle}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      currentUserEmail={currentUserEmail}
      readOnly={readOnly}
      workspaceMode={workspaceMode}
      initialTrackChangesMode={initialTrackChangesMode}
    >
      <ReportWorkspace mode={workspaceMode} />
    </ReportProvider>
  );
}
