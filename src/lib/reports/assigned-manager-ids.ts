export type LegacyReportManagers = {
  assignedManagerId?: string | null;
  assignedManagerIds?: string[] | null;
};

export function normalizeAssignedManagerIds(
  ids: Iterable<string | null | undefined>
): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const id of ids) {
    const value = id?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function assignedManagerIdsForReport<T extends LegacyReportManagers>(
  report: T,
  managerIds: string[] = []
): string[] {
  const explicitIds =
    report.assignedManagerIds && report.assignedManagerIds.length > 0
      ? report.assignedManagerIds
      : managerIds;

  return normalizeAssignedManagerIds([
    ...explicitIds,
    report.assignedManagerId ?? null,
  ]);
}

export function withAssignedManagerIds<T extends LegacyReportManagers>(
  report: T,
  managerIds: string[]
): T & { assignedManagerIds: string[] } {
  return {
    ...report,
    assignedManagerIds: assignedManagerIdsForReport(report, managerIds),
  };
}

export function primaryAssignedManagerId(
  managerIds: string[]
): string | null {
  return managerIds[0] ?? null;
}

export function managerIdsFromFormData(form: FormData): string[] {
  const multi = form
    .getAll("assignedManagerIds")
    .flatMap((value) => String(value).split(","));
  if (multi.length > 0) return normalizeAssignedManagerIds(multi);

  const legacy = form.get("assignedManagerId");
  return normalizeAssignedManagerIds([
    legacy === null || legacy === "" ? null : String(legacy),
  ]);
}
