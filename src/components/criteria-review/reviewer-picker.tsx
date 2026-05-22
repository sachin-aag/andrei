"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CREATE_REVIEWER_VALUE,
  UNSELECTED_REVIEWER_VALUE,
  useCriteriaReviewReviewer,
} from "@/components/criteria-review/reviewer-provider";

export const nativeSelectClassName =
  "flex h-8 w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";

function ReviewerSelectControl({
  id,
  className,
  placeholder = "Select reviewer",
  value,
  onChange,
}: {
  id: string;
  className?: string;
  placeholder?: string;
  value: string;
  onChange: (reviewerId: string) => void;
}) {
  const { reviewerOptions } = useCriteriaReviewReviewer();
  const selectValue = value || UNSELECTED_REVIEWER_VALUE;

  return (
    <select
      id={id}
      name={`criteria-review-reviewer-${id}`}
      autoComplete="off"
      data-1p-ignore
      data-lpignore="true"
      value={selectValue}
      onChange={(e) => {
        const next = e.target.value;
        onChange(
          next === UNSELECTED_REVIEWER_VALUE || next === "" ? "" : next
        );
      }}
      className={cn(nativeSelectClassName, className)}
    >
      <option value={UNSELECTED_REVIEWER_VALUE}>{placeholder}</option>
      {reviewerOptions.map((reviewer) => (
        <option key={reviewer.id} value={reviewer.id}>
          {reviewer.name} ({reviewer.employeeId})
        </option>
      ))}
      <option value={CREATE_REVIEWER_VALUE}>Create reviewer...</option>
    </select>
  );
}

export function CreateReviewerDialog() {
  const {
    createReviewerOpen,
    setCreateReviewerOpen,
    newReviewer,
    setNewReviewer,
    creatingReviewer,
    createError,
    createReviewer,
    clearCreateError,
  } = useCriteriaReviewReviewer();

  return (
    <Dialog
      open={createReviewerOpen}
      onOpenChange={(open) => {
        setCreateReviewerOpen(open);
        if (!open) clearCreateError();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create reviewer</DialogTitle>
          <DialogDescription>
            Add the reviewer name and employee ID. The reviewer will be available
            in the dropdown.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-reviewer-name">Name</Label>
            <Input
              id="new-reviewer-name"
              autoComplete="off"
              value={newReviewer.name}
              onChange={(e) =>
                setNewReviewer((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Reviewer name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-reviewer-employee-id">Employee ID</Label>
            <Input
              id="new-reviewer-employee-id"
              autoComplete="off"
              value={newReviewer.employeeId}
              onChange={(e) =>
                setNewReviewer((prev) => ({
                  ...prev,
                  employeeId: e.target.value,
                }))
              }
              placeholder="Employee ID"
            />
          </div>
          {createError ? (
            <p className="text-sm text-red-700" role="alert">
              {createError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCreateReviewerOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={creatingReviewer}
            onClick={() => void createReviewer()}
          >
            {creatingReviewer ? <Loader2 className="size-4 animate-spin" /> : null}
            Create reviewer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewerPicker() {
  const { selectedReviewer, selectedReviewerId, selectReviewer } =
    useCriteriaReviewReviewer();

  if (!selectedReviewer) return null;

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Label
        htmlFor="reviewer-select"
        className="text-xs text-[var(--muted-foreground)] whitespace-nowrap"
      >
        Reviewer
      </Label>
      <ReviewerSelectControl
        id="reviewer-select"
        className="w-56 bg-[var(--card)]"
        value={selectedReviewerId}
        onChange={selectReviewer}
      />
    </div>
  );
}

export function ReviewerSelectModal() {
  const { ready, selectedReviewer, selectReviewer } = useCriteriaReviewReviewer();
  const open = ready && !selectedReviewer;
  const [pendingReviewerId, setPendingReviewerId] = useState("");

  useEffect(() => {
    if (open) {
      setPendingReviewerId("");
    }
  }, [open]);

  const canContinue =
    pendingReviewerId.length > 0 &&
    pendingReviewerId !== CREATE_REVIEWER_VALUE;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="[&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Select reviewer</DialogTitle>
          <DialogDescription>
            Choose who is reviewing. Evaluations are saved under this reviewer
            identity.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reviewer-select-modal">Reviewer</Label>
          <ReviewerSelectControl
            id="reviewer-select-modal"
            value={pendingReviewerId}
            onChange={(reviewerId) => {
              if (reviewerId === CREATE_REVIEWER_VALUE) {
                selectReviewer(CREATE_REVIEWER_VALUE);
                return;
              }
              setPendingReviewerId(reviewerId);
            }}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={!canContinue}
            onClick={() => selectReviewer(pendingReviewerId)}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
