"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createStatisticalWorkspace } from "@/lib/statistical-analysis/client";

export function StatisticalAnalysisListHeader({
  workspaceCount,
  userName,
  userEmail,
}: {
  workspaceCount: number;
  userName: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const workspace = await createStatisticalWorkspace();
      router.push(`/statistical-analysis/${encodeURIComponent(workspace.id)}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create a worksheet."
      );
      setCreating(false);
    }
  };

  return (
    <header className="shrink-0 border-b border-[var(--border)] px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="size-3.5" />
            Reports
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Statistical Analysis
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] max-w-2xl">
            Enter measurements in a worksheet, then run a Normal Capability
            Sixpack (individuals / I-MR). You only see worksheets you created
            ({workspaceCount}).
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-sm">
          <Button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
          >
            {creating ? "Creating…" : "New worksheet"}
          </Button>
          <p className="text-xs text-[var(--muted-foreground)] text-right">
            Signed in as{" "}
            <span className="font-medium text-[var(--foreground)]">{userName}</span>{" "}
            ({userEmail})
          </p>
        </div>
      </div>
    </header>
  );
}
