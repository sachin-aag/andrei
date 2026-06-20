"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, FileText, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/report/status-badge";
import { formatCalendarDate, formatDate } from "@/lib/utils";
import type { ReportStatus } from "@/db/schema";
import type {
  AdminReportAuthorOption,
  AdminReportSummary,
} from "@/lib/admin/reports";
import { roleLabel } from "@/lib/auth/roles";

type AdminReportsPanelProps = {
  reports: AdminReportSummary[];
  authorOptions: AdminReportAuthorOption[];
  selectedUserId: string | null;
  usersById: Record<string, { name: string; role: string } | undefined>;
};

export function AdminReportsPanel({
  reports,
  authorOptions,
  selectedUserId,
  usersById,
}: AdminReportsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedUser = selectedUserId
    ? authorOptions.find((user) => user.id === selectedUserId)
    : null;

  const filteredAuthors = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return authorOptions;
    return authorOptions.filter(
      (user) =>
        user.name.toLowerCase().includes(normalized) ||
        user.email.toLowerCase().includes(normalized) ||
        roleLabel(user.role).toLowerCase().includes(normalized)
    );
  }, [authorOptions, query]);

  const selectUser = (userId: string | null) => {
    startTransition(() => {
      const next = userId ? `/admin/reports?userId=${encodeURIComponent(userId)}` : "/admin/reports";
      router.push(next);
    });
    setPickerOpen(false);
    setQuery("");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--border)] px-10 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Browse investigation reports by user and open a read-only view of
              the workspace they see.
            </p>
          </div>
          <div className="relative w-full max-w-md">
            <button
              type="button"
              aria-expanded={pickerOpen}
              aria-haspopup="listbox"
              disabled={isPending}
              onClick={() => setPickerOpen((open) => !open)}
              className="flex h-10 w-full items-center justify-between rounded-md border border-[var(--border)] bg-[var(--input)] px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:opacity-60"
            >
              <span className="truncate text-left">
                {selectedUser
                  ? `${selectedUser.name} (${selectedUser.reportCount} report${selectedUser.reportCount === 1 ? "" : "s"})`
                  : "All users"}
              </span>
              <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
            </button>

            {pickerOpen && (
              <div className="absolute z-20 mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--popover)] shadow-lg">
                <div className="border-b border-[var(--border)] p-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
                      aria-hidden="true"
                    />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search by name, email, or role"
                      className="pl-8"
                      autoFocus
                    />
                  </div>
                </div>
                <ul
                  role="listbox"
                  aria-label="Filter reports by user"
                  className="max-h-72 overflow-auto p-1"
                >
                  <li>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedUserId === null}
                      onClick={() => selectUser(null)}
                      className="flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-[var(--accent)]"
                    >
                      <span>All users</span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {reports.length} report{reports.length === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                  {filteredAuthors.map((user) => (
                    <li key={user.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedUserId === user.id}
                        onClick={() => selectUser(user.id)}
                        className="flex w-full flex-col rounded-sm px-3 py-2 text-left text-sm hover:bg-[var(--accent)]"
                      >
                        <span className="font-medium">{user.name}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {roleLabel(user.role)} · {user.email} · {user.reportCount}{" "}
                          report{user.reportCount === 1 ? "" : "s"}
                        </span>
                      </button>
                    </li>
                  ))}
                  {filteredAuthors.length === 0 && (
                    <li className="px-3 py-4 text-sm text-[var(--muted-foreground)]">
                      No users match your search.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>

        {selectedUser && (
          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-full bg-[var(--secondary)] px-3 py-1 text-xs">
              Showing reports by {selectedUser.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => selectUser(null)}
              disabled={isPending}
            >
              <X className="size-3.5" aria-hidden="true" />
              Clear filter
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-10 py-6">
        {reports.length === 0 ? (
          <EmptyState selectedUser={selectedUser} />
        ) : (
          <div className="grid gap-3">
            {reports.map((report) => {
              const author = usersById[report.authorId];
              const manager = report.assignedManagerId
                ? usersById[report.assignedManagerId]
                : undefined;

              return (
                <Card
                  key={report.id}
                  className="p-5 transition-colors hover:border-[var(--brand-500)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Link
                        href={`/admin/reports/${report.id}`}
                        transitionTypes={["nav-forward"]}
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-700)]"
                      >
                        <FileText className="size-5 text-[var(--brand-200)]" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/reports/${report.id}`}
                            transitionTypes={["nav-forward"]}
                            className="flex min-w-0 items-center gap-2"
                          >
                            <h3 className="truncate font-semibold">
                              {report.deviationNo || "Untitled deviation"}
                            </h3>
                            <StatusBadge status={report.status as ReportStatus} />
                          </Link>
                        </div>
                        <Link
                          href={`/admin/reports/${report.id}`}
                          transitionTypes={["nav-forward"]}
                          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <span>Date: {formatCalendarDate(report.date)}</span>
                            <span>·</span>
                            <span>Author: {author?.name ?? "—"}</span>
                            {manager && (
                              <>
                                <span>·</span>
                                <span>Manager: {manager.name}</span>
                              </>
                            )}
                            <span>·</span>
                            <span>Updated: {formatDate(report.updatedAt)}</span>
                          </div>
                        </Link>
                      </div>
                    </div>
                    <Button asChild size="sm" className="shrink-0 gap-1.5 shadow-sm">
                      <Link
                        href={`/admin/reports/${report.id}`}
                        transitionTypes={["nav-forward"]}
                      >
                        View
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  selectedUser,
}: {
  selectedUser: AdminReportAuthorOption | null | undefined;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-[var(--brand-700)]">
        <FileText className="size-8 text-[var(--brand-200)]" />
      </div>
      <h3 className="mb-1 text-lg font-semibold">No reports found</h3>
      <p className="max-w-md text-sm text-[var(--muted-foreground)]">
        {selectedUser
          ? `${selectedUser.name} has not created any reports yet.`
          : "No investigation reports exist in the workspace yet."}
      </p>
    </div>
  );
}
