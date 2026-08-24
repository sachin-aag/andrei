import type { UserRole } from "@/lib/auth/roles";
import {
  canSaveReportSection,
  type ReportAccessRecord,
} from "@/lib/reports/access";

type SaveActor = { id: string; role: UserRole };

/**
 * Rich/plain fields are editable when the section is not explicitly locked
 * and the workspace is writable, or track changes is on (manager review).
 *
 * `locked` is for fields that must stay read-only even in engineer edit
 * mode (e.g. imported signature tables) — not report-level `readOnly`.
 */
export function isTrackChangesFieldEditable(opts: {
  locked?: boolean;
  readOnly: boolean;
  trackChangesMode: boolean;
}): boolean {
  return !opts.locked && (!opts.readOnly || opts.trackChangesMode);
}

/**
 * Client autosave must match `canSaveReportSection` so we never PATCH when
 * the API will 403 (which permanently blocks further saves on that report).
 */
export function shouldAutosaveSection(opts: {
  user: SaveActor | null | undefined;
  report:
    | Pick<ReportAccessRecord, "authorId" | "status" | "deletedAt">
    | null
    | undefined;
  readOnly: boolean;
  trackChangesMode: boolean;
  applyInFlight?: boolean;
  saveBlocked?: boolean;
}): boolean {
  if (!opts.user || !opts.report) return false;
  if (opts.applyInFlight) return false;
  if (opts.saveBlocked) return false;
  if (opts.readOnly && !opts.trackChangesMode) return false;
  return canSaveReportSection(opts.user, opts.report);
}
