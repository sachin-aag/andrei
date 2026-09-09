/** Calendar month key in UTC, e.g. `2026-08`. */
export function currentYearMonthUtc(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function monthCycleBoundsUtc(yearMonth: string): {
  cycleStart: Date;
  cycleEnd: Date;
} {
  const [yearText, monthText] = yearMonth.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const cycleStart = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const cycleEnd = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  return { cycleStart, cycleEnd };
}

/** ISO week (Monday 00:00 UTC → next Monday), half-open. */
export function isoWeekBoundsUtc(date = new Date()): {
  weekStart: Date;
  weekEnd: Date;
} {
  const day = date.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  const weekStart = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - daysFromMonday,
      0,
      0,
      0,
      0
    )
  );
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  return { weekStart, weekEnd };
}
