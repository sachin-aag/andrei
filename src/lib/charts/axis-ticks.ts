/** Wilkinson's-style 1-2-5 nice numbers for chart axes. */

export function niceNumber(range: number, round: boolean): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let nice: number;
  if (round) {
    if (fraction < 1.5) nice = 1;
    else if (fraction < 3) nice = 2;
    else if (fraction < 7) nice = 5;
    else nice = 10;
  } else if (fraction <= 1) {
    nice = 1;
  } else if (fraction <= 2) {
    nice = 2;
  } else if (fraction <= 5) {
    nice = 5;
  } else {
    nice = 10;
  }
  return nice * 10 ** exponent;
}

export function paddedExtent(
  values: number[],
  pad = 0.08
): { min: number; max: number } {
  if (values.length === 0) return { min: -1, max: 1 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  return { min: min - span * pad, max: max + span * pad };
}

export function niceAxisDomain(
  min: number,
  max: number,
  options?: { clampMin?: number }
): { min: number; max: number; step: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1, step: 1 };
  }
  if (max < min) {
    const swapped = min;
    min = max;
    max = swapped;
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const niceSpan = niceNumber(max - min, false);
  const step = niceNumber(niceSpan / 6, true);
  let lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (options?.clampMin != null && lo < options.clampMin) {
    lo = options.clampMin;
  }
  if (hi <= lo) hi = lo + step;
  return {
    min: Number(lo.toPrecision(12)),
    max: Number(hi.toPrecision(12)),
    step,
  };
}

/** Inclusive ticks on a 1-2-5 step, always including the domain ends. */
export function axisTickValues(
  min: number,
  max: number,
  step = niceNumber((max - min) / 6, true)
): number[] {
  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let value = start; value <= max + step / 2; value += step) {
    const rounded = Number(value.toPrecision(12));
    if (rounded >= min - step / 100 && rounded <= max + step / 100) {
      ticks.push(rounded);
    }
    if (ticks.length > 24) break;
  }
  if (!ticks.includes(min)) ticks.unshift(min);
  if (!ticks.includes(max)) ticks.push(max);
  return [...new Set(ticks.map((tick) => Number(tick.toPrecision(12))))].toSorted(
    (a, b) => a - b
  );
}

export function formatAxisTick(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Number(value.toPrecision(12));
  if (Object.is(rounded, -0) || rounded === 0) return "0";
  if (Number.isInteger(rounded)) return String(rounded);
  const abs = Math.abs(rounded);
  if (abs >= 1e6 || abs < 1e-4) return rounded.toExponential(2);
  return String(Number(rounded.toPrecision(6)));
}

export function xTickAnchor(
  index: number,
  count: number
): "start" | "middle" | "end" {
  if (count <= 1) return "middle";
  if (index === 0) return "start";
  if (index === count - 1) return "end";
  return "middle";
}
