"use client";

import { WorkspaceSegmentedTabs } from "./workspace-segmented-tabs";
import type { WorkProductView } from "./workspace-chrome";

const TABS = [
  { value: "report" as const, label: "Report", testId: "report-surface-document" },
  {
    value: "analytics" as const,
    label: "Analytics",
    testId: "report-surface-analytics",
  },
];

export function WorkProductTabs({
  value,
  onChange,
}: {
  value: WorkProductView;
  onChange: (next: WorkProductView) => void;
}) {
  return (
    <WorkspaceSegmentedTabs
      label="Work product"
      value={value}
      tabs={TABS}
      onChange={onChange}
    />
  );
}
