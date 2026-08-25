/**
 * Deterministic 30-row transcript for extraction-gate tests.
 * Not imported by the chat tool — tests only.
 *
 * Requirement M3-SYS-FN-037, three Perioguide handpieces, torque in ozf-in.
 * Values sit on quarter/half increments between 2.5 and 5.5. Limits 1 and 6
 * appear as number tokens in the acceptance sentence on the same page.
 */
export const M3_SYS_FN_037_ATTACHMENT_ID = "att_825-00101-appendix";
export const M3_SYS_FN_037_PAGE = 13;
export const M3_SYS_FN_037_FILENAME = "825-00101 Appendix B.pdf";

export const M3_SYS_FN_037_HANDPIECES = [
  "P33-0924-10012",
  "P33-0924-10017",
  "P33-0924-10018",
] as const;

/** Ten replicates per handpiece, in document order. */
export const M3_SYS_FN_037_VALUES: Record<
  (typeof M3_SYS_FN_037_HANDPIECES)[number],
  readonly number[]
> = {
  "P33-0924-10012": [2.5, 2.75, 3.0, 3.25, 3.5, 3.75, 4.0, 4.25, 4.5, 4.75],
  "P33-0924-10017": [3.0, 3.25, 3.5, 3.75, 4.0, 4.25, 4.5, 4.75, 5.0, 5.25],
  "P33-0924-10018": [2.75, 3.0, 3.25, 3.5, 3.75, 4.0, 4.25, 4.5, 4.75, 5.5],
};

export const M3_SYS_FN_037_LIMITS = { lower: 1, upper: 6 } as const;
export const M3_SYS_FN_037_UOM = "ozf-in";
export const M3_SYS_FN_037_SAMPLE_SIZE_MIN = 29;

function formatTorque(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function rowLines(): string[] {
  const lines: string[] = [];
  let n = 1;
  for (const serial of M3_SYS_FN_037_HANDPIECES) {
    const values = M3_SYS_FN_037_VALUES[serial];
    values.forEach((value, index) => {
      lines.push(
        `${n}. ${serial} Tip ${index + 1}: ${formatTorque(value)} ${M3_SYS_FN_037_UOM}`
      );
      n += 1;
    });
  }
  return lines;
}

export const M3_SYS_FN_037_TRANSCRIPT = [
  "Requirement M3-SYS-FN-037 — Tip Detachment Torque",
  "UoM: ozf-in",
  "Acceptance limits: 1 to 6 ozf-in. Sample size minimum 29.",
  "Handpiece serials: P33-0924-10012, P33-0924-10017, P33-0924-10018.",
  ...rowLines(),
].join("\n");

export type M3SysFn037Row = {
  seriesLabel: string;
  replicateLabel: string;
  value: string;
  uom: string;
  page: number;
  attachmentId: string;
};

export function m3SysFn037ExtractedRows(): M3SysFn037Row[] {
  const rows: M3SysFn037Row[] = [];
  for (const serial of M3_SYS_FN_037_HANDPIECES) {
    M3_SYS_FN_037_VALUES[serial].forEach((value, index) => {
      rows.push({
        seriesLabel: serial,
        replicateLabel: `Tip ${index + 1}`,
        value: formatTorque(value),
        uom: M3_SYS_FN_037_UOM,
        page: M3_SYS_FN_037_PAGE,
        attachmentId: M3_SYS_FN_037_ATTACHMENT_ID,
      });
    });
  }
  return rows;
}
