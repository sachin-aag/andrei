/**
 * MJ ELR periods always start 1 April and end 31 March of the following
 * year. Do not copy a PRQR execution window or a 3-month SCADA alarm-trend
 * quarter.
 */

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export type ElrFinancialYearWindow = {
  startYear: number;
  fromLabel: string;
  toLabel: string;
};

/** 1 April of `startYear` through 31 March of `startYear + 1`. */
export function elrFinancialYearWindow(startYear: number): ElrFinancialYearWindow {
  return {
    startYear,
    fromLabel: `01-Apr-${startYear}`,
    toLabel: `31-Mar-${startYear + 1}`,
  };
}

/**
 * Period start year containing `date`: month ≥ April starts that calendar
 * year; Jan–Mar belongs to the window that started the previous April.
 */
export function indianFyStartYearContaining(
  year: number,
  month: number
): number {
  return month >= 4 ? year : year - 1;
}

export function parseElrIdentityDate(
  raw: string | null | undefined
): { year: number; month: number; day: number } | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  }

  const dmyNum = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(s);
  if (dmyNum) {
    const day = Number(dmyNum[1]);
    const month = Number(dmyNum[2]);
    let year = Number(dmyNum[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  }

  const dmyMon =
    /^(\d{1,2})[ ./-]+([A-Za-z]{3,9})[ ./-]+(\d{2,4})$/.exec(s);
  if (dmyMon) {
    const day = Number(dmyMon[1]);
    const month = MONTHS[dmyMon[2]!.toLowerCase()];
    let year = Number(dmyMon[3]);
    if (year < 100) year += 2000;
    if (!month || day < 1 || day > 31) return null;
    return { year, month, day };
  }

  return null;
}

function isCanonicalFyBounds(
  from: { year: number; month: number; day: number },
  to: { year: number; month: number; day: number }
): boolean {
  return (
    from.day === 1 &&
    from.month === 4 &&
    to.day === 31 &&
    to.month === 3 &&
    to.year === from.year + 1
  );
}

/** `PRQR-25-PR-005` → FY starting April 2025. */
export function fyStartYearFromDocumentNumber(
  raw: string | null | undefined
): number | null {
  if (!raw) return null;
  const match = /\b(?:PRQR|PRQP|PQR|ELR)-(\d{2})-/i.exec(raw.trim());
  if (!match) return null;
  return 2000 + Number(match[1]);
}

/**
 * Canonical 1 April–31 March window. Prefer title-page dates when they
 * already are that shape; otherwise infer from periodFrom, periodTo,
 * last PRQ, or a document FY digit.
 */
export function canonicalElrPeriod(input: {
  periodFrom?: string | null;
  periodTo?: string | null;
  lastPrqDate?: string | null;
  lastPrqNo?: string | null;
}): ElrFinancialYearWindow | null {
  const from = parseElrIdentityDate(input.periodFrom);
  const to = parseElrIdentityDate(input.periodTo);
  if (from && to && isCanonicalFyBounds(from, to)) {
    return elrFinancialYearWindow(from.year);
  }
  if (from) {
    return elrFinancialYearWindow(
      indianFyStartYearContaining(from.year, from.month)
    );
  }
  if (to) {
    return elrFinancialYearWindow(indianFyStartYearContaining(to.year, to.month));
  }
  const lastPrq = parseElrIdentityDate(input.lastPrqDate);
  if (lastPrq) {
    return elrFinancialYearWindow(
      indianFyStartYearContaining(lastPrq.year, lastPrq.month)
    );
  }
  const fromDoc = fyStartYearFromDocumentNumber(input.lastPrqNo);
  if (fromDoc) return elrFinancialYearWindow(fromDoc);
  return null;
}

export const ELR_FY_PERIOD_RULE =
  "always start 1 April and end 31 March of the following year. Write both calendar dates. Do not copy a 3-month alarm-trend window or a PRQR execution span.";
