"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ManagerSelector } from "@/components/report/manager-selector";
import type { AttachmentLibraryAssetRecord } from "@/lib/attachments/library-dto";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

type Props = {
  currentUser: Pick<WorkspaceUser, "id" | "role">;
  workspaceUsers: WorkspaceUser[];
};

export function DocumentLibrarySection({ currentUser, workspaceUsers }: Props) {
  const [assets, setAssets] = useState<AttachmentLibraryAssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [granteeIds, setGranteeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/attachment-library?scope=mine");
      const data = (await response.json().catch(() => ({}))) as {
        assets?: AttachmentLibraryAssetRecord[];
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Could not load your document library");
        return;
      }
      setAssets(data.assets ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const loadGrants = useCallback(async (assetId: string) => {
    const response = await fetch(`/api/attachment-library/${assetId}/access`);
    const data = (await response.json().catch(() => ({}))) as {
      grants?: { granteeUserId: string }[];
      error?: string;
    };
    if (!response.ok) {
      toast.error(data.error ?? "Could not load sharing settings");
      setGranteeIds([]);
      return;
    }
    setGranteeIds(data.grants?.map((grant) => grant.granteeUserId) ?? []);
  }, []);

  const selectAsset = (assetId: string) => {
    setSelectedAssetId(assetId);
    void loadGrants(assetId);
  };

  const saveGrants = async () => {
    if (!selectedAssetId) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/attachment-library/${selectedAssetId}/access`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ granteeUserIds: granteeIds }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Could not update sharing");
        return;
      }
      toast.success("Sharing updated");
    } finally {
      setSaving(false);
    }
  };

  const shareCandidates = workspaceUsers.filter(
    (user) => user.id !== currentUser.id
  );

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 lg:col-span-2">
      <h2 className="text-base font-semibold">Document library</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Files you upload are saved to your library and can be reused across
        reports. Choose a file to manage who else can add it to their reports.
      </p>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading library…
        </div>
      ) : assets.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">
          You have not uploaded any library documents yet. Upload a PDF or Word
          file in a report to add it here.
        </p>
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-1 rounded-md border border-[var(--border)] p-2">
            {assets.map((asset) => {
              const selected = selectedAssetId === asset.id;
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => selectAsset(asset.id)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    selected
                      ? "bg-[var(--secondary)] text-[var(--foreground)]"
                      : "hover:bg-[var(--secondary)]/50"
                  }`}
                >
                  <span className="truncate">{asset.filename}</span>
                  <span className="ml-2 shrink-0 text-xs text-[var(--muted-foreground)]">
                    {asset.processingStatus}
                  </span>
                </button>
              );
            })}
          </div>

          <div>
            {selectedAssetId ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium">Shared with</h3>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Revoking access stops new reports from linking this file.
                    Existing report links stay in place.
                  </p>
                </div>
                <ManagerSelector
                  managers={shareCandidates}
                  selectedIds={granteeIds}
                  onSelectedIdsChange={setGranteeIds}
                  placeholder="Add colleagues…"
                  emptyMessage="No other workspace users are available."
                />
                <button
                  type="button"
                  onClick={() => void saveGrants()}
                  disabled={saving}
                  className="inline-flex items-center rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save sharing"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                Select a document to manage sharing.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
