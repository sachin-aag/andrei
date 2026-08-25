"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { captureEvent } from "@/lib/analytics/events";
import { EXPERT_REVIEW_NOTE_MAX_LENGTH } from "@/lib/reports/hidden-expert-reviewer";

export function RequestExpertReviewDialog({
  open,
  onOpenChange,
  reportId,
  documentNo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  documentNo: string;
}) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const close = () => {
    if (sending) return;
    onOpenChange(false);
  };

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/expert-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Could not send the expert review request");
        return;
      }
      captureEvent("expert_review_requested", { reportId });
      toast.success(
        "Request sent to Andrei's experts. You are copied on the email."
      );
      setNote("");
      onOpenChange(false);
    } catch {
      toast.error("Could not send the expert review request");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask an Andrei expert</DialogTitle>
          <DialogDescription>
            Send {documentNo || "this report"} to Andrei&apos;s human experts.
            They get a link to open and edit the report, and you are copied on
            the email. This does not submit the report to your manager.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-1">
          <Label htmlFor="expert-review-note" className="normal-case tracking-normal">
            Note for the experts
          </Label>
          <Textarea
            id="expert-review-note"
            value={note}
            disabled={sending}
            maxLength={EXPERT_REVIEW_NOTE_MAX_LENGTH}
            placeholder="What should they look at? (optional)"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={sending}
            onClick={close}
          >
            Cancel
          </Button>
          <Button type="button" disabled={sending} onClick={() => void send()}>
            {sending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {sending ? "Sending…" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
