import { splitSentences } from "@/lib/citations/citation-site";
import {
  citationNumbersFromMarker,
  isNumericCitationMarker,
  isSourceCitationBracket,
  parseSourceCitation,
} from "@/lib/placeholders/citation-bracket";
import { sourceCitationsByNumber } from "@/lib/suggestions/citations-at-end";

export type HardFactKind =
  | "date"
  | "duration"
  | "temperature"
  | "identifier"
  | "number";

export type CitedPage = {
  filename: string;
  page: number;
};

export type ClaimProvenanceStatus =
  | "verified"
  | "unsourced"
  | "citation_moved";

export type ClaimProvenanceRecord = {
  text: string;
  kind: HardFactKind;
  status: ClaimProvenanceStatus;
  cited?: CitedPage | null;
  source?: { filename: string; page: number; attachmentId: string } | null;
  /**
   * Set when a saved analysis computed this value rather than a page printing
   * it. Traceability shows both the analysis and the pages its rows came from,
   * so the claim stays checkable end to end.
   */
  analysis?: {
    analysisId: string;
    title: string;
    pages: CitedPage[];
  } | null;
};

export type UnsupportedFactPolicy = "block" | "flag";

export type ClaimProvenance = {
  claims: ClaimProvenanceRecord[];
  policy: UnsupportedFactPolicy;
};

export type HardFact = {
  text: string;
  kind: HardFactKind;
  start: number;
  end: number;
  normalized: string;
  cited: CitedPage[];
};

const MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

const DATE_RE = new RegExp(
  String.raw`\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+${MONTH}\s+\d{4}|${MONTH}\s+\d{4})\b`,
  "gi"
);

/**
 * Minutes and seconds are here because an excursion is measured in them. A
 * clock delta (`00:13:39`) counts too — that is how an instrument cursor
 * reports a duration, and it is copied into reports verbatim.
 */
const DURATION_RE =
  /\b\d{1,3}:\d{2}:\d{2}\b|\b\d+(?:\.\d+)?\s*(?:days?|d|hours?|hrs?|h|min(?:ute)?s?|sec(?:ond)?s?|weeks?|wk)\b/gi;

const TEMPERATURE_RE =
  /\b\d+(?:\.\d+)?\s*[–-]\s*\d+(?:\.\d+)?\s*°?\s*C\b|\b\d+(?:\.\d+)?\s*°\s*C\b/gi;

const IDENTIFIER_RE =
  /\b(?:URS-\d+|SOP\/[A-Z]{2,}\/[A-Z]{2,}\/\d{3}(?:\s*R\d+)?|[A-Z]\/[A-Z]{2}\/\d{3}|[A-Z]{2,5}-\d{2}-[A-Z0-9]+(?:-[A-Z0-9]+)+|[A-Z]{2,8}(?:\/[A-Z]{2,8})+\/\d{2,}(?:\/[A-Z0-9]+)*)\b/g;

/**
 * Instrument units matter as much as lab units here: a vacuum reading, a
 * chamber pressure, a flow rate and a conductivity are the quantities a
 * process investigation is made of, and until they were listed the gate could
 * not see them at all — a model could write any vacuum figure and nothing
 * checked it.
 */
const INSTRUMENT_UNIT =
  "(?:mL|ml|µL|uL|(?<=\\s)L|CFU|cfu|units?|%|kg(?:\\/cm(?:²|2))?|g|mg|µg|ug|µbar|ubar|mbar|bar|kPa|MPa|Pa|psi|mmHg|torr|rpm|kHz|Hz|lpm|LPM|µm|um|mm|cm|nm|ppm|ppb|mS\\/cm|µS\\/cm|uS\\/cm)";

const NUMBER_WITH_UNIT_RE = new RegExp(
  String.raw`\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*${INSTRUMENT_UNIT}?\b|\b\d+(?:\.\d+)?\s*${INSTRUMENT_UNIT}(?!\w)`,
  "gi"
);

const BARE_THOUSANDS_RE = /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g;
/** Standalone 0, not the trailing digit of 25.0 or the leading digit of 0.5. */
const BARE_ZERO_RE = /(?<![\d.])0\b(?!\.\d)/g;

const HEADING_ONLY_RE = /^\d+(?:\.\d+)+$/;

export function placeholderForFactKind(kind: HardFactKind): string {
  switch (kind) {
    case "date":
      return "<date>";
    case "identifier":
      return "<identifier>";
    case "number":
      return "<number>";
    case "duration":
    case "temperature":
      return "<value>";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function stripCitationBrackets(text: string): string {
  return text.replace(/\[[^\]]+\]/g, (match) => {
    if (isSourceCitationBracket(match) || isNumericCitationMarker(match)) {
      return "";
    }
    return match;
  });
}

function citationsInRange(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  parkedByNumber: ReadonlyMap<number, string>
): CitedPage[] {
  const cited: CitedPage[] = [];
  const re = /\[[^\]]+\]/g;
  re.lastIndex = rangeStart;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index >= rangeEnd) break;
    if (match.index < rangeStart) continue;
    const raw = match[0];
    if (isNumericCitationMarker(raw)) {
      for (const n of citationNumbersFromMarker(raw)) {
        const parked = parkedByNumber.get(n);
        if (!parked) continue;
        const parsed = parseSourceCitation(parked);
        if (!parsed || parsed.pages.length === 0) continue;
        for (const page of parsed.pages) {
          cited.push({ filename: parsed.filename, page });
        }
      }
      continue;
    }
    if (!isSourceCitationBracket(raw)) continue;
    const parsed = parseSourceCitation(raw);
    if (!parsed) continue;
    if (parsed.pages.length === 0) continue;
    for (const page of parsed.pages) {
      cited.push({ filename: parsed.filename, page });
    }
  }
  return cited;
}

/** Source pages cited in `text`, including parked `[n]` resolved via Citations:. */
export function citedPagesFromText(text: string): CitedPage[] {
  if (!text.trim()) return [];
  return citationsInRange(text, 0, text.length, sourceCitationsByNumber(text));
}

function citationSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const re = /\[[^\]]+\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (isSourceCitationBracket(match[0]) || isNumericCitationMarker(match[0])) {
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return spans;
}

function overlaps(
  start: number,
  end: number,
  taken: Array<{ start: number; end: number }>
): boolean {
  return taken.some((span) => start < span.end && end > span.start);
}

function pushMatch(
  facts: HardFact[],
  taken: Array<{ start: number; end: number }>,
  citeSpans: Array<{ start: number; end: number }>,
  match: RegExpExecArray,
  kind: HardFactKind,
  cited: CitedPage[]
): void {
  const raw = match[0];
  const start = match.index;
  const end = start + raw.length;
  if (HEADING_ONLY_RE.test(raw.trim())) return;
  if (overlaps(start, end, citeSpans)) return;
  if (overlaps(start, end, taken)) return;
  taken.push({ start, end });
  facts.push({
    text: raw,
    kind,
    start,
    end,
    normalized: normalizeFactText(raw, kind),
    cited,
  });
}

function collectKind(
  facts: HardFact[],
  taken: Array<{ start: number; end: number }>,
  citeSpans: Array<{ start: number; end: number }>,
  text: string,
  regex: RegExp,
  kind: HardFactKind,
  citedFor: (start: number, end: number) => CitedPage[]
): void {
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    pushMatch(
      facts,
      taken,
      citeSpans,
      match,
      kind,
      citedFor(match.index, match.index + match[0].length)
    );
  }
}

/**
 * Hard facts a regulated draft must trace to retrieved page text.
 * Citation brackets are ignored as facts (they are locators, not claims).
 */
export function extractHardFacts(text: string): HardFact[] {
  if (!text.trim()) return [];
  const facts: HardFact[] = [];
  const taken: Array<{ start: number; end: number }> = [];
  const citeSpans = citationSpans(text);
  const parkedByNumber = sourceCitationsByNumber(text);
  const sentenceCited = (start: number, end: number): CitedPage[] => {
    for (const span of splitSentences(text)) {
      if (start >= span.start && start < span.end) {
        return citationsInRange(text, span.start, span.end, parkedByNumber);
      }
    }
    return citationsInRange(
      text,
      Math.max(0, start - 80),
      Math.min(text.length, end + 80),
      parkedByNumber
    );
  };

  collectKind(facts, taken, citeSpans, text, IDENTIFIER_RE, "identifier", sentenceCited);
  collectKind(facts, taken, citeSpans, text, DATE_RE, "date", sentenceCited);
  collectKind(facts, taken, citeSpans, text, TEMPERATURE_RE, "temperature", sentenceCited);
  collectKind(facts, taken, citeSpans, text, DURATION_RE, "duration", sentenceCited);
  collectKind(facts, taken, citeSpans, text, NUMBER_WITH_UNIT_RE, "number", sentenceCited);
  collectKind(facts, taken, citeSpans, text, BARE_THOUSANDS_RE, "number", sentenceCited);
  collectKind(facts, taken, citeSpans, text, BARE_ZERO_RE, "number", sentenceCited);

  facts.sort((a, b) => a.start - b.start);
  return facts;
}

export function normalizeFactText(text: string, kind: HardFactKind): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  switch (kind) {
    case "identifier":
      return collapsed.toUpperCase();
    case "date":
      return collapsed.toLowerCase().replace(/[.,]/g, "");
    case "number":
    case "duration":
    case "temperature":
      return collapsed.replace(/,/g, "").replace(/\s+/g, "").replace(/°/g, "").toLowerCase();
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function replaceFactsWithPlaceholders(
  text: string,
  facts: readonly HardFact[]
): string {
  if (facts.length === 0) return text;
  const ordered = [...facts].sort((a, b) => b.start - a.start);
  let next = text;
  for (const fact of ordered) {
    next =
      next.slice(0, fact.start) +
      placeholderForFactKind(fact.kind) +
      next.slice(fact.end);
  }
  return next.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?])/g, "$1");
}
