"use client";

import { useState } from "react";
import { CalendarDays, Hash, Users, Wrench } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useAutoSave } from "@/hooks/use-auto-save";
import { SaveStatus } from "./save-status";
import { useReportData } from "@/providers/report-provider";
import { useUserDirectory } from "@/providers/user-directory-provider";
import { ManagerSelector } from "@/components/report/manager-selector";
import type { ReportRecord } from "@/types/report";

function initialManagerIds(report: ReportRecord): string[] {
  const managerIds = report.assignedManagerIds ?? [];
  return managerIds.length > 0
    ? managerIds
    : report.assignedManagerId
      ? [report.assignedManagerId]
      : [];
}

function ReportHeaderForm({
  report,
  setReport,
  readOnly,
}: {
  report: ReportRecord;
  setReport: React.Dispatch<React.SetStateAction<ReportRecord>>;
  readOnly: boolean;
}) {
  const [deviationNo, setDeviationNo] = useState(report.deviationNo);
  const [date, setDate] = useState(report.date.slice(0, 10));
  const [toolsUsed, setToolsUsed] = useState(report.toolsUsed);
  const [otherTools, setOtherTools] = useState(report.otherTools);
  const [assignedManagerIds, setAssignedManagerIds] = useState(() =>
    initialManagerIds(report)
  );
  const { users } = useUserDirectory();
  const managers = users.filter((user) => user.role === "manager");

  const { status, lastSavedAt } = useAutoSave({
    enabled: !readOnly,
    value: { deviationNo, date, toolsUsed, otherTools, assignedManagerIds },
    onSave: async (v, context) => {
      const res = await fetch(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviationNo: v.deviationNo,
          date: new Date(v.date).toISOString(),
          toolsUsed: v.toolsUsed,
          otherTools: v.otherTools,
          assignedManagerIds: v.assignedManagerIds,
        }),
        signal: context?.signal,
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setReport(data.report);
    },
  });

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="grid gap-2 min-w-[180px]">
            <Label>
              Date
              <CalendarDays className="inline size-3 ml-1" />
            </Label>
            <Input
              type="date"
              value={date}
              disabled={readOnly}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2 flex-1 min-w-[220px]">
            <Label>
              <Hash className="inline size-3 mr-1" />
              Deviation No.
            </Label>
            <Input
              placeholder="DEV/PK/26/001"
              value={deviationNo}
              disabled={readOnly}
              onChange={(e) => setDeviationNo(e.target.value)}
            />
          </div>
          <div className="ml-auto self-end">
            {!readOnly && <SaveStatus status={status} lastSavedAt={lastSavedAt} />}
          </div>
        </div>

        <div>
          <Label>
            <Wrench className="inline size-3 mr-1" />
            Investigation Tool Used
          </Label>
          <div className="flex flex-wrap gap-4 mt-2">
            {([
              ["sixM", "6M"],
              ["fiveWhy", "5 Why"],
              ["brainstorming", "Brainstorming"],
            ] as const).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <Checkbox
                  checked={toolsUsed[key]}
                  onCheckedChange={(v) =>
                    setToolsUsed((prev) => ({ ...prev, [key]: v === true }))
                  }
                  disabled={readOnly}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Label>
            <Users className="inline size-3 mr-1" />
            Reviewer managers
          </Label>
          <ManagerSelector
            managers={managers}
            selectedIds={assignedManagerIds}
            disabled={readOnly}
            onSelectedIdsChange={setAssignedManagerIds}
            emptyMessage="No managers are available to assign."
          />
        </div>

        <div className="grid gap-2">
          <Label>Other Tools (If any)</Label>
          <Textarea
            placeholder="Not applicable"
            value={otherTools}
            disabled={readOnly}
            onChange={(e) => setOtherTools(e.target.value)}
            className="min-h-[60px]"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportHeader() {
  const { report, setReport, readOnly } = useReportData();
  return (
    <ReportHeaderForm
      key={report.id}
      report={report}
      setReport={setReport}
      readOnly={readOnly}
    />
  );
}
