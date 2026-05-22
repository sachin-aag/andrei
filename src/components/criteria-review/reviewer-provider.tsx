"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { HumanReviewer } from "@/lib/criteria-review/human-judgment";
import {
  clearLegacyReviewerStorage,
  persistReviewer,
  storedReviewerIdFor,
} from "@/lib/criteria-review/reviewer-storage";

export const CREATE_REVIEWER_VALUE = "__create_reviewer__";
export const UNSELECTED_REVIEWER_VALUE = "__none__";

type CriteriaReviewReviewerContextValue = {
  ready: boolean;
  reviewerOptions: HumanReviewer[];
  selectedReviewer: HumanReviewer | null;
  selectedReviewerId: string;
  selectReviewer: (reviewerId: string) => void;
  createReviewerOpen: boolean;
  setCreateReviewerOpen: (open: boolean) => void;
  newReviewer: { name: string; employeeId: string };
  setNewReviewer: React.Dispatch<
    React.SetStateAction<{ name: string; employeeId: string }>
  >;
  creatingReviewer: boolean;
  createError: string | null;
  createReviewer: () => Promise<void>;
  clearCreateError: () => void;
};

const CriteriaReviewReviewerContext =
  createContext<CriteriaReviewReviewerContextValue | null>(null);

export function CriteriaReviewReviewerProvider({
  initialReviewers,
  authUserId,
  children,
}: {
  initialReviewers: HumanReviewer[];
  authUserId: string | null;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [reviewerOptions, setReviewerOptions] =
    useState<HumanReviewer[]>(initialReviewers);
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [createReviewerOpen, setCreateReviewerOpen] = useState(false);
  const [creatingReviewer, setCreatingReviewer] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newReviewer, setNewReviewer] = useState({ name: "", employeeId: "" });
  const hydratedRef = useRef(false);

  useEffect(() => {
    setReviewerOptions(initialReviewers);
  }, [initialReviewers]);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    clearLegacyReviewerStorage();
    const savedId = storedReviewerIdFor(reviewerOptions, authUserId);
    if (savedId) {
      setSelectedReviewerId(savedId);
    }
    setReady(true);
  }, [reviewerOptions, authUserId]);

  const selectedReviewer = useMemo(
    () =>
      reviewerOptions.find((reviewer) => reviewer.id === selectedReviewerId) ??
      null,
    [reviewerOptions, selectedReviewerId]
  );

  const selectReviewer = useCallback(
    (reviewerId: string) => {
      if (reviewerId === CREATE_REVIEWER_VALUE) {
        setCreateError(null);
        setCreateReviewerOpen(true);
        return;
      }
      if (!reviewerId || reviewerId === UNSELECTED_REVIEWER_VALUE) {
        setSelectedReviewerId("");
        return;
      }
      const nextReviewer = reviewerOptions.find(
        (reviewer) => reviewer.id === reviewerId
      );
      if (!nextReviewer) return;
      setSelectedReviewerId(reviewerId);
      persistReviewer(nextReviewer, authUserId);
    },
    [reviewerOptions, authUserId]
  );

  const createReviewer = useCallback(async () => {
    const name = newReviewer.name.trim();
    const employeeId = newReviewer.employeeId.trim();
    if (!name || !employeeId) {
      setCreateError("Reviewer name and employee ID are required.");
      return;
    }
    setCreatingReviewer(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/criteria-review/reviewers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, employeeId }),
      });
      const data = (await res.json()) as {
        reviewer?: HumanReviewer;
        error?: string;
      };
      if (!res.ok || !data.reviewer) {
        setCreateError(data.error ?? "Could not create reviewer.");
        return;
      }
      setReviewerOptions((prev) => {
        const withoutDuplicate = prev.filter((r) => r.id !== data.reviewer!.id);
        return [...withoutDuplicate, data.reviewer!].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      });
      setNewReviewer({ name: "", employeeId: "" });
      setSelectedReviewerId(data.reviewer.id);
      persistReviewer(data.reviewer, authUserId);
      setCreateReviewerOpen(false);
    } catch {
      setCreateError("Could not create reviewer.");
    } finally {
      setCreatingReviewer(false);
    }
  }, [newReviewer, authUserId]);

  const value = useMemo(
    () => ({
      ready,
      reviewerOptions,
      selectedReviewer,
      selectedReviewerId,
      selectReviewer,
      createReviewerOpen,
      setCreateReviewerOpen,
      newReviewer,
      setNewReviewer,
      creatingReviewer,
      createError,
      createReviewer,
      clearCreateError: () => setCreateError(null),
    }),
    [
      ready,
      reviewerOptions,
      selectedReviewer,
      selectedReviewerId,
      selectReviewer,
      createReviewerOpen,
      newReviewer,
      creatingReviewer,
      createError,
      createReviewer,
    ]
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
