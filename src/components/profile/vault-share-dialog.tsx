"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ManagerSelector } from "@/components/report/manager-selector";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

export function VaultShareDialog({
  open,
  onOpenChange,
  itemLabel,
  itemCount,
  shareCandidates,
  sharing,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemLabel: string;
  itemCount: number;
  shareCandidates: WorkspaceUser[];
  sharing: boolean;
  onConfirm: (granteeUserIds: string[]) => void;
}) {
  const [granteeIds, setGranteeIds] = useState<string[]>([]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setGranteeIds([]);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="library-share-dialog">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription>
            Share {itemLabel} with colleagues. They can add these files to
            their reports. Sharing a folder includes every file inside it.
            Existing report links stay in place.
          </DialogDescription>
        </DialogHeader>
        <ManagerSelector
          managers={shareCandidates}
          selectedIds={granteeIds}
          onSelectedIdsChange={setGranteeIds}
          placeholder="Add colleagues…"
          searchPlaceholder="Search colleagues…"
          noResultsMessage="No colleagues match your search."
          emptyMessage="No other workspace users are available."
          inDialog
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={sharing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(granteeIds)}
            disabled={sharing || granteeIds.length === 0}
            data-testid="library-share-confirm"
          >
            {sharing
              ? "Sharing…"
              : `Share ${itemCount} item${itemCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
