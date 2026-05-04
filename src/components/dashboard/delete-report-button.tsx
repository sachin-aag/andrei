"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Props = {
  reportId: string;
  reportTitle: string;
};

export function DeleteReportButton({ reportId, reportTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const confirmDelete = () => {
    startTransition(async () => {
      const res = await fetch(`/api/reports/${reportId}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "Could not delete report");
        return;
      }
      toast.success("Report deleted");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
          aria-label={`Delete report ${reportTitle}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Trash2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this report?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <p className="font-medium text-[var(--foreground)]">{reportTitle}</p>
              <p>
                This permanently removes the report, sections, comments, and
                evaluations. This cannot be undone.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={confirmDelete}
            className="gap-2"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete report"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
