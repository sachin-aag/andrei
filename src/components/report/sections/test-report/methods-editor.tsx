"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { Button } from "@/components/ui/button";
import { useGenericReportSection, useReportData } from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import { protocolModificationCountPhrase } from "@/lib/design-inputs/protocol-modifications";
import {
  EMPTY_TEST_REPORT_METHODS,
  asTestReportMethods,
  type TestReportMethodsSection,
} from "@/lib/document-types/verification-test-report/sections";
import { verificationTestReportMetadata } from "@/types/report";

export function TestReportMethodsEditor() {
  const { report, refresh, readOnly } = useReportData();
  const { update } = useGenericReportSection<TestReportMethodsSection>(
    "methods_of_measurement"
  );
  const { status, lastSavedAt, value, flushSave } = useGenericSectionSave(
    "methods_of_measurement"
  );
  const content = asTestReportMethods(value ?? EMPTY_TEST_REPORT_METHODS);
  const [pulling, setPulling] = useState(false);
  const sourceId = verificationTestReportMetadata(report).sourceProtocolReportId;
  const snapshot = content.protocolModifications;
  const countPhrase = protocolModificationCountPhrase(snapshot?.rows.length ?? 0);

  async function pullFromProtocol() {
    setPulling(true);
    try {
      const res = await fetch(
        `/api/reports/${report.id}/pull-protocol-modifications`,
        { method: "POST" }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        protocolModifications?: TestReportMethodsSection["protocolModifications"];
      };
      if (!res.ok) {
        toast.error(body.error ?? "Could not pull protocol modifications.");
        return;
      }
      if (body.protocolModifications) {
        update((prev) => ({
          ...asTestReportMethods(prev),
          protocolModifications: body.protocolModifications!,
        }));
      }
      await refresh();
    } finally {
      setPulling(false);
    }
  }

  return (
    <SectionShell
      title="Methods of Measurement"
      description="Executed protocol, pulled protocol modifications, UUTs, and equipment."
      status={status}
      lastSavedAt={lastSavedAt}
      section="methods_of_measurement"
    >
      <div className="grid gap-6">
        <TiptapSectionField
          section="methods_of_measurement"
          contentPath="executedProtocol"
          label="Executed protocol"
          placeholder="Identify the executed protocol by number and revision…"
          className="grid gap-2"
          value={content.executedProtocol}
          onChange={(doc) =>
            update((prev) => ({
              ...asTestReportMethods(prev),
              executedProtocol: doc,
            }))
          }
          onFlushSave={flushSave}
        />

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Protocol modifications</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={readOnly || pulling || !sourceId}
              onClick={() => void pullFromProtocol()}
            >
              {pulling ? "Pulling…" : "Pull from protocol"}
            </Button>
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            There {snapshot?.rows.length === 1 ? "was" : "were"} {countPhrase}{" "}
            modification{snapshot?.rows.length === 1 ? "" : "s"} pulled from the
            linked protocol register. This count is computed, not typed.
          </p>
          {snapshot?.pulledAt ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Snapshot from {snapshot.pulledAt}
            </p>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              Link a source protocol on the cover page, then pull accepted
              register rows.
            </p>
          )}
          {snapshot && snapshot.rows.length > 0 ? (
            <ul className="grid gap-2">
              {snapshot.rows.map((row) => (
                <li
                  key={row.findingId}
                  className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <div className="font-medium">{row.findingId}</div>
                  <div className="text-[var(--muted-foreground)]">
                    {row.target}: {row.before} → {row.after}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <TiptapSectionField
          section="methods_of_measurement"
          contentPath="uuts"
          label="Units under test"
          placeholder="Identify the units under test…"
          className="grid gap-2"
          value={content.uuts}
          onChange={(doc) =>
            update((prev) => ({ ...asTestReportMethods(prev), uuts: doc }))
          }
          onFlushSave={flushSave}
        />

        <TiptapSectionField
          section="methods_of_measurement"
          contentPath="equipment"
          label="Equipment"
          placeholder="Keep the seeded equipment columns."
          className="grid gap-2"
          value={content.equipment}
          onChange={(doc) =>
            update((prev) => ({
              ...asTestReportMethods(prev),
              equipment: doc,
            }))
          }
          onFlushSave={flushSave}
        />
      </div>
    </SectionShell>
  );
}
