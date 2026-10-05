"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { DocumentType } from "@/db/schema";
import type { UserRole } from "@/lib/auth/roles";
import type { ReportBundle } from "@/types/report";
import type { WorkspaceMode } from "@/providers/report-provider";
import { ReportProvider } from "@/providers/report-provider";
import { ReportWorkspaceLoading } from "@/components/report/report-workspace-loading";
import {
  fetchWorkspaceBundle,
  workspaceLoadErrorMessage,
  WorkspaceLoadError,
} from "@/components/report/report-workspace-bundle";
import { loadSectionEditors } from "@/components/report/section-editor-loaders";

const ReportWorkspace = dynamic(
  () =>
    import("@/components/report/report-workspace").then(
      (mod) => mod.ReportWorkspace
    ),
  { ssr: false, loading: () => <ReportWorkspaceLoading /> }
);

/**
 * /edit used to stream the full bundle through the RSC client boundary.
 * Fetch the body after AppShell paints so Home stays clickable. The GET
 * times out instead of leaving "Loading report…" forever.
 */
export function ReportWorkspaceLoader({
  reportId,
  documentType,
  currentUserId,
  currentUserRole,
  currentUserEmail,
  readOnly,
  workspaceMode,
  initialTrackChangesMode = false,
}: {
  reportId: string;
  documentType: DocumentType;
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserEmail: string;
  readOnly: boolean;
  workspaceMode: WorkspaceMode;
  initialTrackChangesMode?: boolean;
}) {
  const [bundle, setBundle] = useState<ReportBundle | null>(null);
  const [editorsReady, setEditorsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSectionEditors(documentType).then(
      () => {
        if (!cancelled) setEditorsReady(true);
      },
      () => {
        if (!cancelled) setEditorsReady(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [documentType]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next = await fetchWorkspaceBundle(reportId);
        if (cancelled) return;
        setBundle(next);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof WorkspaceLoadError) {
          setError(workspaceLoadErrorMessage(err.status, err.timedOut));
          return;
        }
        setError(workspaceLoadErrorMessage(0));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--muted-foreground)]">{error}</p>
      </div>
    );
  }

  if (!bundle || !editorsReady) {
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
