"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AttachmentQuotaDialogProps = {
  message: string | null;
  onDismiss: () => void;
};

/** Blocking modal for attachment count/storage quota errors — requires dismiss. */
export function AttachmentQuotaDialog({
  message,
  onDismiss,
}: AttachmentQuotaDialogProps) {
  return (
    <Dialog
      open={message != null}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Attachment limit reached</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={onDismiss}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
