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
