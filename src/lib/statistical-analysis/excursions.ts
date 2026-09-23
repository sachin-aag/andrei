/**
 * Out-of-band run detection over a measurement series.
 *
 * An investigation does not care about 15,000 readings; it cares about the
 * handful of contiguous stretches that left the acceptance range, and for each
 * one: when it started, how long it lasted, how far it went and in which
 * direction. That is the whole of the analysis, and doing it in code rather
 * than by reading pages is what makes the result reproducible.
 *
 * Acceptance limits may be conditional. A lyophilizer's vacuum band depends on
 * the recorded setpoint (800 -> 650-950, 600 -> 480-720); a stability study's
 * limit depends on the timepoint; a multi-grade line's depends on the grade.
 * `ConditionalSpec` covers all three — the limit is selected per row by another
 * column rather than fixed for the series.
 */

export type SpecBand = {
  lsl: number | null;
  usl: number | null;
};

/** Limits selected per row by the value of another column. */
export type ConditionalSpec = {
  /** Human-readable name of the selecting column, for reporting. */
  byColumn: string;
  /**
   * Selector value -> band. Keys are compared as trimmed numeric strings when
   * both sides parse as numbers, so "800" and "800.0" select the same band.
   */
  bands: ReadonlyArray<{ when: string; band: SpecBand }>;
  /** Applied when no selector matches. Omit to leave unmatched rows unjudged. */
  fallback?: SpecBand;
};

export type Spec = SpecBand | ConditionalSpec;

export type ExcursionDirection = "low" | "high" | "mixed";

export type ExcursionRun = {
  /** Inclusive row indices into the input series. */
  startIndex: number;
  endIndex: number;
  /** Row labels (timestamps) at the ends, when labels were supplied. */
  startLabel: string | null;
  endLabel: string | null;
  /** Number of consecutive out-of-band readings. */
  readings: number;
  /** Elapsed milliseconds between first and last reading; null without timestamps. */
  elapsedMs: number | null;
  min: number;
  max: number;
  direction: ExcursionDirection;
  /** The band this run was judged against. */
  band: SpecBand;
  /** Selector value in force during the run, when the spec is conditional. */
  condition: string | null;
  /** Source pages the run's rows came from, ascending and de-duplicated. */
  pages: number[];
};

export type DetectExcursionsInput = {
  /** The measured series. Non-numeric rows are treated as gaps, not excursions. */
  values: ReadonlyArray<number | null>;
  /** Display labels per row, typically timestamps. */
  labels?: ReadonlyArray<string>;
  /** Epoch milliseconds per row, used for elapsed time. */
  timestamps?: ReadonlyArray<number | null>;
  /** Selector value per row, when the spec is conditional. */
  conditions?: ReadonlyArray<string>;
  /** Source page per row, carried onto each run for citation. */
  pages?: ReadonlyArray<number>;
  spec: Spec;
};

function isConditional(spec: Spec): spec is ConditionalSpec {
  return "bands" in spec;
}

function sameSelector(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  if (left === right) return true;
  const ln = Number(left);
  const rn = Number(right);
  return Number.isFinite(ln) && Number.isFinite(rn) && ln === rn;
}

/** The band in force for one row, or null when nothing applies. */
export function bandForRow(spec: Spec, condition: string | undefined): SpecBand | null {
  if (!isConditional(spec)) return spec;
  if (condition !== undefined) {
    for (const entry of spec.bands) {
      if (sameSelector(entry.when, condition)) return entry.band;
    }
  }
  return spec.fallback ?? null;
}

function outOfBand(value: number, band: SpecBand): "low" | "high" | null {
  if (band.lsl !== null && value < band.lsl) return "low";
  if (band.usl !== null && value > band.usl) return "high";
  return null;
}

/**
 * Contiguous out-of-band runs, in series order.
 *
 * A run ends when a reading returns inside the band, when the applicable band
 * changes (a new step has different limits, so it is a different excursion),
 * or when the series gaps.
 */
export function detectExcursions(
  input: DetectExcursionsInput
): ExcursionRun[] {
  const { values, labels, timestamps, conditions, pages, spec } = input;
  const runs: ExcursionRun[] = [];

  type Open = {
    startIndex: number;
    endIndex: number;
    min: number;
    max: number;
    directions: Set<"low" | "high">;
    band: SpecBand;
    condition: string | null;
    pages: Set<number>;
  };
  let open: Open | null = null;

  const close = () => {
    if (!open) return;
    const startTs = timestamps?.[open.startIndex] ?? null;
    const endTs = timestamps?.[open.endIndex] ?? null;
    runs.push({
      startIndex: open.startIndex,
      endIndex: open.endIndex,
      startLabel: labels?.[open.startIndex] ?? null,
      endLabel: labels?.[open.endIndex] ?? null,
      readings: open.endIndex - open.startIndex + 1,
      elapsedMs:
        startTs !== null && endTs !== null ? endTs - startTs : null,
      min: open.min,
      max: open.max,
      direction:
        open.directions.size > 1
          ? "mixed"
          : ([...open.directions][0] ?? "low"),
      band: open.band,
      condition: open.condition,
      pages: [...open.pages].sort((a, b) => a - b),
    });
    open = null;
  };

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    const condition = conditions?.[i];
    const band = bandForRow(spec, condition);

    if (value === null || value === undefined || !Number.isFinite(value) || !band) {
      close();
      continue;
    }

    const breach = outOfBand(value, band);
    if (!breach) {
      close();
      continue;
    }

    // A change of applicable band starts a new excursion: the reading is being
    // judged against different limits, so merging them would report a duration
    // against a band that was not in force for all of it.
    const bandChanged =
      open !== null &&
      (open.band.lsl !== band.lsl || open.band.usl !== band.usl);
    if (bandChanged) close();

    if (!open) {
      open = {
        startIndex: i,
        endIndex: i,
        min: value,
        max: value,
        directions: new Set([breach]),
        band,
        condition: condition ?? null,
        pages: new Set(),
      };
    } else {
      open.endIndex = i;
      open.min = Math.min(open.min, value);
      open.max = Math.max(open.max, value);
      open.directions.add(breach);
    }
    const page = pages?.[i];
    if (typeof page === "number") open.pages.add(page);
  }
  close();

  return runs;
}

/** Elapsed time as `H:MM:SS`, matching how instrument cursors report a delta. */
export function formatElapsed(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Whole minutes between first and last reading. Distinct from `readings`, and
 * the distinction matters: ERF/26/022 reported one excursion as 8, 7, 87 and
 * "087" minutes in four places because the two conventions were mixed.
 */
export function elapsedMinutes(run: ExcursionRun): number | null {
  if (run.elapsedMs === null) return null;
  return Math.round(run.elapsedMs / 60000);
}

/** Parse `dd/mm/yyyy` + `HH:MM:SS` from an instrument print into epoch ms. */
export function parseInstrumentTimestamp(
  date: string,
  time: string
): number | null {
  const d = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!d || !t) return null;
  const ms = Date.UTC(
    Number(d[3]),
    Number(d[2]) - 1,
    Number(d[1]),
    Number(t[1]),
    Number(t[2]),
    Number(t[3] ?? "0")
  );
  return Number.isFinite(ms) ? ms : null;
}
