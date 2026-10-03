"use client";

import { createContext, use } from "react";
import type {
  ReviewCategory,
  ReviewCheckDto,
  ReviewCheckId,
  ReviewFindingDto,
} from "@/lib/review/ui";

export type ReviewCategoryFilter = "all" | ReviewCategory;

export type ReviewContextValue = {
  state: {
    checks: ReviewCheckDto[];
    findings: ReviewFindingDto[];
    placeholderCount: number;
    category: ReviewCategoryFilter;
    openCheckId: ReviewCheckId | null;
    runningCheckIds: string[];
    loading: boolean;
    canRun: boolean;
  };
  actions: {
    setCategory: (category: ReviewCategoryFilter) => void;
    toggleCheck: (checkId: ReviewCheckId) => void;
    runChecks: (checkIds?: string[], category?: ReviewCategory) => Promise<void>;
    patchFinding: (findingId: string, status: "verified" | "dismissed") => Promise<void>;
    refresh: () => Promise<void>;
  };
};

export const ReviewContext = createContext<ReviewContextValue | null>(null);

export function useReview(): ReviewContextValue {
  const value = use(ReviewContext);
  if (!value) {
    throw new Error("useReview must be used within Review.Provider");
  }
  return value;
}
