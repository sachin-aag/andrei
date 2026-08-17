"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SectionShell } from "@/components/report/sections/section-shell";
import { Button } from "@/components/ui/button";
import { getCustomerPack } from "@/lib/customers/packs";
import { convergentCheckRunOptions } from "@/lib/customers/convergent/protocol-config";
import { runAllChecks } from "@/lib/design-inputs/checks";
import { withProposedFixes } from "@/lib/design-inputs/propose-fix";
import type {
  Finding,
  FindingDisposition,
  ModificationRow,
  SourcesContent,
} from "@/lib/design-inputs/types";
import {
  asLedger,
  asModificationRegister,
  asSources,
} from "@/lib/document-types/verification-protocol/sections";
import { useReportAttachments } from "@/providers/report-attachments-provider";
import {
  useGenericReportSection,
  useReportData,
} from "@/providers/report-provider";

const DISPOSITION_ORDER: FindingDisposition[] = [
  "defect",
  "needs_confirmation",
  "review_queue",
  "clean",
];

const DISPOSITION_LABEL: Record<FindingDisposition, string> = {
  defect: "Defects",
  needs_confirmation: "Needs confirmation",
  review_queue: "Review queue",
  clean: "Clean",
};

export function ProtocolFindingsList() {
  const { readOnly, report } = useReportData();
  const { value: ledgerRaw } = useGenericReportSection("design_inputs");
  const { value: sourcesRaw } = useGenericReportSection<SourcesContent>("sources");
  const { value: registerRaw, replace: replaceRegister } =
    useGenericReportSection("modification_register");
  const { attachments, openDocument } = useReportAttachments();

  const sources = asSources(sourcesRaw);
  const register = asModificationRegister(registerRaw);

  const findings = useMemo(() => {
    const ledger = asLedger(ledgerRaw);
    const options =
      getCustomerPack().id === "convergent" ? convergentCheckRunOptions() : {};
    return withProposedFixes(runAllChecks(ledger, options), ledger);
  }, [ledgerRaw]);

  const grouped = useMemo(() => {
    return DISPOSITION_ORDER.map((disposition) => ({
      disposition,
      items: findings.filter((f) => f.disposition === disposition),
    })).filter((g) => g.items.length > 0);
  }, [findings]);

  async function persistRegister(rows: ModificationRow[]) {
    replaceRegister({ rows });
    const res = await fetch(
      `/api/reports/${report.id}/sections/modification_register`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { rows } }),
      }
    );
    if (!res.ok) toast.error("Could not update the modification register.");
  }

  return (
    <SectionShell
      title="Findings"
      description="SOP checks on the ledger. Accept a proposed fix to add it to the modification register. Dismiss leaves the finding without a register row."
      showSaveStatus={false}
      section="findings"
    >
      {grouped.map((group) => (
        <div key={group.disposition} className="space-y-2">
          <h3 className="text-sm font-semibold">
            {DISPOSITION_LABEL[group.disposition]} ({group.items.length})
          </h3>
          {group.items.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              readOnly={readOnly}
              accepted={register.rows.some(
                (r) => r.findingId === finding.id && r.status === "accepted"
              )}
              onAccept={async () => {
                if (!finding.proposedFix) return;
                const next = [
                  ...register.rows.filter((r) => r.findingId !== finding.id),
                  { ...finding.proposedFix, status: "accepted" as const },
                ];
                await persistRegister(next);
              }}
              onDismiss={async () => {
                const next = register.rows.filter(
                  (r) => r.findingId !== finding.id
                );
                await persistRegister(next);
              }}
              onOpenEvidence={() => {
                const page = finding.evidence[0]?.page || 1;
                const doc = finding.evidence[0]?.doc ?? "protocol";
                const needle =
                  doc === "srs"
                    ? sources.srsNo
                    : doc === "plan"
                      ? sources.planNo
                      : sources.protocolNo;
                const attachment = attachments.find((a) =>
                  needle
                    ? a.filename.includes(needle)
                    : a.filename.toLowerCase().includes(doc)
                );
                if (!attachment) {
                  toast.error("No attached PDF matches this evidence source.");
                  return;
                }
                openDocument(attachment.id, page);
              }}
            />
          ))}
        </div>
      ))}
    </SectionShell>
  );
}

function FindingCard({
  finding,
  readOnly,
  accepted,
  onAccept,
  onDismiss,
  onOpenEvidence,
}: {
  finding: Finding;
  readOnly: boolean;
  accepted: boolean;
  onAccept: () => void;
  onDismiss: () => void;
  onOpenEvidence: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
            {finding.severity} · {finding.check}
          </span>
          {finding.reqIds.length > 0 ? (
            <span className="font-mono text-sm">{finding.reqIds.join(", ")}</span>
          ) : null}
        </div>
        <p className="mt-1 text-sm">{finding.evidence[0]?.quote}</p>
      </button>
      {open ? (
        <div className="mt-3 space-y-2 text-sm">
          {finding.corroboratedBy ? (
            <p className="text-[var(--muted-foreground)]">
              Corroborated by {finding.corroboratedBy.doc}:{" "}
              {finding.corroboratedBy.quote}
            </p>
          ) : null}
          {finding.questions.map((q) => (
            <p key={q} className="text-[var(--muted-foreground)]">
              {q}
            </p>
          ))}
          {finding.proposedFix ? (
            <div className="rounded bg-[var(--secondary)] p-2">
              <p className="font-medium">Proposed fix</p>
              <p className="mt-1 line-through opacity-70">
                {finding.proposedFix.before}
              </p>
              <p className="mt-1">{finding.proposedFix.after}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onOpenEvidence}>
              Open evidence
            </Button>
            {finding.proposedFix && !readOnly ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={accepted}
                  onClick={onAccept}
                >
                  {accepted ? "Accepted" : "Accept"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onDismiss}
                >
                  Dismiss
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
