import type { auditEvents } from "@/db/schema";

type AuditRow = typeof auditEvents.$inferSelect;

/** Spreadsheet clients may execute cell values starting with these characters. */
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsv(value: string): string {
  const neutralized = CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function auditEventsToCsv(events: AuditRow[]): string {
  const headers = [
    "seq",
    "created_at",
    "actor_id",
    "actor_name",
    "actor_role",
    "action",
    "entity_type",
    "entity_id",
    "report_id",
    "summary",
    "old_value",
    "new_value",
    "hash",
    "prev_hash",
  ];

  const lines = [headers.join(",")];
  for (const e of events) {
    lines.push(
      [
        String(e.seq),
        e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
        e.actorId,
        e.actorName,
        e.actorRole,
        e.action,
        e.entityType,
        e.entityId,
        e.reportId ?? "",
        e.summary,
        formatJson(e.oldValue),
        formatJson(e.newValue),
        e.hash,
        e.prevHash,
      ]
        .map((v) => escapeCsv(String(v)))
        .join(",")
    );
  }
  return lines.join("\n");
}
