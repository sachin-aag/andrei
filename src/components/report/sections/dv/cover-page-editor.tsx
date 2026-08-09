"use client";

import { useCallback } from "react";
import { SectionShell } from "@/components/report/sections/section-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useReportData } from "@/providers/report-provider";
import {
  designVerificationMetadata,
  type ReportRecord,
} from "@/types/report";
import type { DesignVerificationMetadata } from "@/db/schema";

export function DvCoverPageEditor() {
  const { report, setReport, readOnly } = useReportData();
  const meta = designVerificationMetadata(report);

  const patchMetadata = useCallback(
    async (patch: Partial<DesignVerificationMetadata>) => {
      const nextMeta = { ...meta, ...patch };
      setReport((prev) => ({ ...prev, metadata: nextMeta }));
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: nextMeta }),
      });
      if (!res.ok) {
        // leave optimistic state; user can retry
      }
    },
    [meta, report.id, setReport]
  );

  const patchDocumentNo = useCallback(
    async (documentNo: string) => {
      setReport((prev) => ({ ...prev, documentNo }));
      await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentNo }),
      });
    },
    [report.id, setReport]
  );

  return (
    <SectionShell
      title="Cover Page & Document Control"
      description="Document identity fields used for evaluation and export."
      status="idle"
      lastSavedAt={null}
      section="cover_page"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="dv-document-no">Document Number</Label>
          <Input
            id="dv-document-no"
            value={report.documentNo}
            disabled={readOnly}
            onChange={(e) =>
              setReport((prev: ReportRecord) => ({
                ...prev,
                documentNo: e.target.value,
              }))
            }
            onBlur={(e) => void patchDocumentNo(e.target.value.trim())}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dv-revision">Revision</Label>
          <Input
            id="dv-revision"
            value={meta.revision}
            disabled={readOnly}
            onChange={(e) =>
              setReport((prev) => ({
                ...prev,
                metadata: { ...meta, revision: e.target.value },
              }))
            }
            onBlur={(e) => void patchMetadata({ revision: e.target.value.trim() })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dv-effective">Effective Date</Label>
          <Input
            id="dv-effective"
            value={meta.effectiveDate}
            disabled={readOnly}
            onChange={(e) =>
              setReport((prev) => ({
                ...prev,
                metadata: { ...meta, effectiveDate: e.target.value },
              }))
            }
            onBlur={(e) =>
              void patchMetadata({ effectiveDate: e.target.value.trim() })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dv-product">Product Name</Label>
          <Input
            id="dv-product"
            value={meta.productName}
            disabled={readOnly}
            onChange={(e) =>
              setReport((prev) => ({
                ...prev,
                metadata: { ...meta, productName: e.target.value },
              }))
            }
            onBlur={(e) =>
              void patchMetadata({ productName: e.target.value.trim() })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dv-model">Model Number</Label>
          <Input
            id="dv-model"
            value={meta.modelNumber}
            disabled={readOnly}
            onChange={(e) =>
              setReport((prev) => ({
                ...prev,
                metadata: { ...meta, modelNumber: e.target.value },
              }))
            }
            onBlur={(e) =>
              void patchMetadata({ modelNumber: e.target.value.trim() })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dv-project">Project Name</Label>
          <Input
            id="dv-project"
            value={meta.projectName}
            disabled={readOnly}
            onChange={(e) =>
              setReport((prev) => ({
                ...prev,
                metadata: { ...meta, projectName: e.target.value },
              }))
            }
            onBlur={(e) =>
              void patchMetadata({ projectName: e.target.value.trim() })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dv-author">Author</Label>
          <Input
            id="dv-author"
            value={meta.authorName}
            disabled={readOnly}
            onChange={(e) =>
              setReport((prev) => ({
                ...prev,
                metadata: { ...meta, authorName: e.target.value },
              }))
            }
            onBlur={(e) =>
              void patchMetadata({ authorName: e.target.value.trim() })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dv-reviewer">Reviewer</Label>
          <Input
            id="dv-reviewer"
            value={meta.reviewerName}
            disabled={readOnly}
            onChange={(e) =>
              setReport((prev) => ({
                ...prev,
                metadata: { ...meta, reviewerName: e.target.value },
              }))
            }
            onBlur={(e) =>
              void patchMetadata({ reviewerName: e.target.value.trim() })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dv-approver">Approver</Label>
          <Input
            id="dv-approver"
            value={meta.approverName}
            disabled={readOnly}
            onChange={(e) =>
              setReport((prev) => ({
                ...prev,
                metadata: { ...meta, approverName: e.target.value },
              }))
            }
            onBlur={(e) =>
              void patchMetadata({ approverName: e.target.value.trim() })
            }
          />
        </div>
      </div>
    </SectionShell>
  );
}
