"use client";

import type { ReactNode } from "react";
import type { HumanReviewer } from "@/lib/criteria-review/human-judgment";
import { CriteriaReviewReviewerProvider } from "@/components/criteria-review/reviewer-provider";
import {
  CreateReviewerDialog,
  ReviewerSelectModal,
} from "@/components/criteria-review/reviewer-picker";

export function CriteriaReviewShell({
  initialReviewers,
  authUserId,
  children,
}: {
  initialReviewers: HumanReviewer[];
  authUserId: string | null;
  children: ReactNode;
}) {
  return (
    <CriteriaReviewReviewerProvider
      initialReviewers={initialReviewers}
      authUserId={authUserId}
    >
      <ReviewerSelectModal />
      <CreateReviewerDialog />
      {children}
    </CriteriaReviewReviewerProvider>
  );
}
