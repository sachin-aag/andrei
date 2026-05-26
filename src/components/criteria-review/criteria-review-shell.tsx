"use client";

import type { ReactNode } from "react";
import type { HumanReviewer } from "@/lib/criteria-review/human-judgment";
import { CriteriaReviewReviewerProvider } from "@/components/criteria-review/reviewer-provider";

export function CriteriaReviewShell({
  reviewer,
  children,
}: {
  reviewer: HumanReviewer;
  children: ReactNode;
}) {
  return (
    <CriteriaReviewReviewerProvider reviewer={reviewer}>
      {children}
    </CriteriaReviewReviewerProvider>
  );
}
