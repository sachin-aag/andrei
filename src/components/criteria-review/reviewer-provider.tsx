"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { HumanReviewer } from "@/lib/criteria-review/human-judgment";

type CriteriaReviewReviewerContextValue = {
  selectedReviewer: HumanReviewer;
  selectedReviewerId: string;
};

const CriteriaReviewReviewerContext =
  createContext<CriteriaReviewReviewerContextValue | null>(null);

export function CriteriaReviewReviewerProvider({
  reviewer,
  children,
}: {
  reviewer: HumanReviewer;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      selectedReviewer: reviewer,
      selectedReviewerId: reviewer.id,
    }),
    [reviewer]
  );

  return (
    <CriteriaReviewReviewerContext value={value}>
      {children}
    </CriteriaReviewReviewerContext>
  );
}

export function useCriteriaReviewReviewer() {
  const context = useContext(CriteriaReviewReviewerContext);
  if (!context) {
    throw new Error(
      "useCriteriaReviewReviewer must be used within CriteriaReviewReviewerProvider"
    );
  }
  return context;
}
