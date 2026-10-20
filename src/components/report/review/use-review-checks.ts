"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { normalizeCommentRecord } from "@/lib/comments/normalize";
import {
  reviewRunWaves,
  type ReviewCategory,
  type ReviewCheckDto,
  type ReviewFindingDto,
} from "@/lib/review/ui";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import {
  useReportComments,
  useReportData,
  useReportEvaluations,
} from "@/providers/report-provider";

export function useReviewChecks() {
  const { report, workspaceMode } = useReportData();
  const { setComments } = useReportComments();
  const { setEvaluations, setReviewFindings } = useReportEvaluations();
  const [checks, setChecks] = useState<ReviewCheckDto[]>([]);
  const [findings, setFindings] = useState<ReviewFindingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningCheckIds, setRunningCheckIds] = useState<string[]>([]);
  const [applyingFindingId, setApplyingFindingId] = useState<string | null>(
    null
  );

  const applySnapshot = useCallback(
    (data: {
      checks?: ReviewCheckDto[];
      findings?: ReviewFindingDto[];
      comments?: unknown[];
      evaluations?: EvaluationRecord[];
    }) => {
      if (data.checks) setChecks(data.checks);
      if (data.findings) {
        setFindings(data.findings);
        setReviewFindings(data.findings);
      }
      if (Array.isArray(data.comments)) {
        setComments(
          data.comments.map((row) =>
            normalizeCommentRecord(row as Record<string, unknown>)
          ) as CommentRecord[]
        );
      }
      if (Array.isArray(data.evaluations)) {
        setEvaluations(data.evaluations);
      }
    },
    [setComments, setEvaluations, setReviewFindings]
  );

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/reports/${report.id}/review`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      checks: ReviewCheckDto[];
      findings: ReviewFindingDto[];
    };
    applySnapshot(data);
  }, [applySnapshot, report.id]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/reports/${report.id}/review`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        applySnapshot(data);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applySnapshot, report.id]);

  const runChecks = useCallback(
    async (checkIds?: string[], category?: ReviewCategory) => {
      const waves = reviewRunWaves(checks, { checkIds, category });
      const ids = waves.flatMap((wave) => {
        if (wave.checkIds && wave.checkIds.length > 0) return wave.checkIds;
        return checks
          .filter((check) => check.kind === "run")
          .filter((check) =>
            wave.category ? check.category === wave.category : true
          )
          .map((check) => check.id);
      });
      if (ids.length === 0) return;
      setRunningCheckIds(ids);
      const failed: string[] = [];
      try {
        for (const wave of waves) {
          const res = await fetch(`/api/reports/${report.id}/review/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              wave.checkIds && wave.checkIds.length > 0
                ? { checkIds: wave.checkIds }
                : { category: wave.category }
            ),
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const message =
              typeof errBody.error === "string" ? errBody.error : "";
            if (
              res.status === 504 ||
              res.status === 408 ||
              /timed out/i.test(message)
            ) {
              toast.error(
                "Review checks timed out. Try Run on one category — Report, FDA, Citations, or Writing."
              );
              return;
            }
            toast.error(message || "Review checks failed. Please try again.");
            return;
          }
          const data = (await res.json()) as {
            checks: ReviewCheckDto[];
            findings: ReviewFindingDto[];
            comments?: unknown[];
            evaluations?: EvaluationRecord[];
            failed?: string[];
          };
          applySnapshot(data);
          if (data.failed) failed.push(...data.failed);
        }
        if (failed.length > 0) {
          toast.error(`${failed.length} review check(s) failed.`);
        }
      } finally {
        setRunningCheckIds([]);
      }
    },
    [applySnapshot, checks, report.id]
  );

  const applyTrackedChange = useCallback(
    async (findingId: string): Promise<string | null> => {
      setApplyingFindingId(findingId);
      try {
        const res = await fetch(
          `/api/reports/${report.id}/review/findings/${encodeURIComponent(findingId)}/apply`,
          { method: "POST" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          commentId?: string;
          finding?: ReviewFindingDto;
          comments?: unknown[];
          error?: string;
        };
        if (!res.ok) {
          toast.error(
            typeof data.error === "string"
              ? data.error
              : "Could not apply that suggestion."
          );
          return null;
        }
        if (Array.isArray(data.comments)) {
          setComments(
            data.comments.map((row) =>
              normalizeCommentRecord(row as Record<string, unknown>)
            ) as CommentRecord[]
          );
        }
        const nextCommentId =
          typeof data.commentId === "string" ? data.commentId : null;
        if (data.finding) {
          const updated = data.finding;
          setFindings((prev) =>
            prev.map((row) => (row.id === updated.id ? updated : row))
          );
          setReviewFindings((prev) => {
            const exists = prev.some((row) => row.id === updated.id);
            if (exists) {
              return prev.map((row) =>
                row.id === updated.id ? updated : row
              );
            }
            return [...prev, updated];
          });
        } else if (nextCommentId) {
          const patch = (row: ReviewFindingDto): ReviewFindingDto =>
            row.id === findingId
              ? { ...row, commentId: nextCommentId, kind: "fixable" }
              : row;
          setFindings((prev) => prev.map(patch));
          setReviewFindings((prev) => prev.map(patch));
        }
        return nextCommentId;
      } finally {
        setApplyingFindingId(null);
      }
    },
    [report.id, setComments, setReviewFindings]
  );

  const patchFinding = useCallback(
    async (findingId: string, status: "verified" | "dismissed") => {
      const livePrefix = "live:";
      if (findingId.startsWith(livePrefix)) {
        // Live criteria rows are evaluations, not stored findings: bypass the criterion.
        const evaluationId = findingId.slice(livePrefix.length);
        const res = await fetch(
          `/api/reports/${report.id}/evaluations/${encodeURIComponent(evaluationId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bypassed: true }),
          }
        );
        if (!res.ok) {
          toast.error("Could not update that finding.");
          return;
        }
        setEvaluations((prev) =>
          prev.map((row) =>
            row.id === evaluationId ? { ...row, bypassed: true } : row
          )
        );
      } else {
        const res = await fetch(
          `/api/reports/${report.id}/review/findings/${findingId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }
        );
        if (!res.ok) {
          toast.error("Could not update that finding.");
          return;
        }
        const data = (await res.json().catch(() => ({}))) as {
          dismissedCommentId?: string | null;
        };
        const dismissedCommentId = data.dismissedCommentId;
        if (dismissedCommentId) {
          setComments((prev) =>
            prev.map((row) =>
              row.id === dismissedCommentId ? { ...row, status: "dismissed" } : row
            )
          );
        }
      }
      setFindings((prev) => prev.filter((row) => row.id !== findingId));
      setReviewFindings((prev) => prev.filter((row) => row.id !== findingId));
      setChecks((prev) =>
        prev.map((check) => {
          const remaining = findings.filter(
            (row) => row.id !== findingId && row.checkId === check.id
          ).length;
          if (check.id !== findings.find((row) => row.id === findingId)?.checkId) {
            return check;
          }
          return {
            ...check,
            issueCount: remaining,
            status: remaining > 0 ? check.status : "clean",
          };
        })
      );
    },
    [findings, report.id, setComments, setEvaluations, setReviewFindings]
  );

  return {
    checks,
    findings,
    loading,
    runningCheckIds,
    applyingFindingId,
    canRun: workspaceMode !== "view",
    runChecks,
    patchFinding,
    applyTrackedChange,
    refresh,
  };
}
