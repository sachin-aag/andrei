/**
 * MJ ELR §6.0 Recommendation must name calendar dates and how often each
 * follow-up runs. Shared by Criteria and remaining-section completeness.
 */

const MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const DATE_RE = new RegExp(
  String.raw`\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+${MONTH}\s+\d{4}|${MONTH}\s+\d{4})\b`,
  "i"
);

const FREQUENCY_RE = new RegExp(
  String.raw`\b(?:annual(?:ly)?|yearly|once\s+(?:a|per)\s+year|half[-\s]?year(?:ly)?|bi[-\s]?annual(?:ly)?|semi[-\s]?annual(?:ly)?|twice\s+(?:a|per)\s+year|biennial|\d+[-\s]?year(?:ly)?|quarter(?:ly)?|once\s+a\s+quarter|every\s+quarter|monthly|once\s+a\s+month|weekly|daily|every\s+\d+\s*(?:day|week|month|year)s?|per\s+(?:shift|batch|campaign|lot)|financial\s+year|Indian\s+FY|\bFY\b|±\s*\d+\s+working\s+days)\b`,
  "i"
);

const VAGUE_TIMING_RE =
  /\b(?:soon|as required|as needed|periodically|in due course|timely|at the earliest|when due|ongoing)\b/i;

export function recommendationHasCalendarDate(text: string): boolean {
  return DATE_RE.test(text);
}

export function recommendationHasFrequency(text: string): boolean {
  return FREQUENCY_RE.test(text);
}

export function recommendationHasSchedule(text: string): boolean {
  return recommendationHasCalendarDate(text) && recommendationHasFrequency(text);
}

export function recommendationHasVagueTiming(text: string): boolean {
  return VAGUE_TIMING_RE.test(text);
}

export function recommendationMentionsDate(
  text: string,
  dateCell: string
): boolean {
  const hay = normalizeDateHaystack(text);
  return dateMentionTokens(dateCell).some((token) => hay.includes(token));
}

function normalizeDateHaystack(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\d+)(?:st|nd|rd|th)\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function dateMentionTokens(cell: string): string[] {
  const raw = cell.trim();
  if (!raw) return [];
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return tokensForYmd(iso[1]!, iso[2]!, iso[3]!);
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(raw);
  if (dmy) {
    const day = dmy[1]!.padStart(2, "0");
    const month = dmy[2]!.padStart(2, "0");
    const yearRaw = dmy[3]!;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return tokensForYmd(year, month, day);
  }
  return [normalizeDateHaystack(raw)];
}

function tokensForYmd(year: string, month: string, day: string): string[] {
  const long = MONTH_NAMES[Number(month) - 1];
  if (!long) return [`${year}-${month}-${day}`];
  const short = long.slice(0, 3);
  const d = String(Number(day));
  const m = String(Number(month));
  return [
    `${year}-${month}-${day}`,
    `${day}/${month}/${year}`,
    `${d}/${month}/${year}`,
    `${d}/${m}/${year}`,
    `${day}-${month}-${year}`,
    `${d} ${short} ${year}`,
    `${d} ${long} ${year}`,
    `${day} ${long} ${year}`,
    `${short} ${year}`,
    `${long} ${year}`,
  ].map((token) => token.toLowerCase());
}
