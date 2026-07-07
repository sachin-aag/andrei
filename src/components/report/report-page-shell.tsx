"use client";

import type { ReactNode } from "react";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import type { PasswordStatus } from "@/lib/auth/password-status";
import type { ReportBundle } from "@/types/report";
import { AppShell } from "@/components/layout/app-shell";
import { ReportLeftNav } from "@/components/report/report-left-nav";
import {
  ReportProvider,
  useReportAttachments,
  type WorkspaceMode,
} from "@/providers/report-provider";
import type { UserRole } from "@/lib/auth/roles";

type ReportPageShellProps = {
  user: WorkspaceUser;
  initialUsers: WorkspaceUser[];
  passwordStatus?: PasswordStatus;
  inactivityTimeoutMinutes?: number;
  bundle: ReportBundle;
  currentUserId: string;
  userRole: UserRole;
  readOnly: boolean;
  workspaceMode: WorkspaceMode;
  initialTrackChangesMode?: boolean;
  backHref: string;
  backLabel: string;
  children: ReactNode;
};

function ReportNavSlot({
  collapsed,
  backHref,
  backLabel,
}: {
  collapsed: boolean;
  backHref: string;
  backLabel: string;
}) {
  const { jumpToSection } = useReportAttachments();
  return (
    <ReportLeftNav
      collapsed={collapsed}
      backHref={backHref}
      backLabel={backLabel}
      onJumpToSection={jumpToSection}
    />
  );
}

export function ReportPageShell({
  user,
  initialUsers,
  passwordStatus,
  inactivityTimeoutMinutes,
  bundle,
  currentUserId,
  userRole,
  readOnly,
  workspaceMode,
  initialTrackChangesMode = false,
  backHref,
  backLabel,
  children,
}: ReportPageShellProps) {
  return (
    <ReportProvider
      bundle={bundle}
      currentUserId={currentUserId}
      userRole={userRole}
      readOnly={readOnly}
      workspaceMode={workspaceMode}
      initialTrackChangesMode={initialTrackChangesMode}
    >
      <AppShell
        user={user}
        initialUsers={initialUsers}
        passwordStatus={passwordStatus}
        inactivityTimeoutMinutes={inactivityTimeoutMinutes}
        navSlot={(collapsed) => (
          <ReportNavSlot
            collapsed={collapsed}
            backHref={backHref}
            backLabel={backLabel}
          />
        )}
      >
        {children}
      </AppShell>
    </ReportProvider>
  );
}
