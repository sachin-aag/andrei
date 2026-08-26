import { IMR_CONSTANTS, MIN_VALUES_FOR_SIXPACK } from "./types";
import type {
  CapabilityIndices,
  CapabilitySixpackConfig,
  CapabilitySixpackResult,
  ControlChartSeries,
  CurvePoint,
  HistogramBin,
  ProbabilityPlotPoint,
  SixpackComputeOutcome,
} from "./types";
import {
  clampProbability,
  normalCdf,
  normalPdf,
  stdNormCdf,
  stdNormInv,
} from "./normal";
import { columnNumericValues, findColumn } from "./worksheet";
import { normalizeRowSelection } from "./row-selection";
import type { WorksheetData } from "./types";

function meanOf(values: number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function sampleStdev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  let sumSq = 0;
  for (const value of values) {
    const d = value - mean;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (values.length - 1));
}

function movingRanges(values: number[]): number[] {
  const ranges: number[] = [];
  for (let i = 1; i < values.length; i++) {
    ranges.push(Math.abs(values[i]! - values[i - 1]!));
  }
  return ranges;
}

function outOfControlIndices(values: number[], ucl: number, lcl: number): number[] {
  const indices: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!;
    if (value > ucl || value < lcl) indices.push(i);
  }
  return indices;
}

function controlSeries(
  values: number[],
  center: number,
  ucl: number,
  lcl: number
): ControlChartSeries {
  return {
    values,
    center,
    ucl,
    lcl,
    outOfControl: outOfControlIndices(values, ucl, lcl),
  };
}

function indexFromSpecs(mean: number, sd: number, spec: number): number | null {
  if (sd <= 0) return null;
  return (spec - mean) / (3 * sd);
}

function pairIndices(
  mean: number,
  sd: number,
  lsl: number | null,
  usl: number | null
): { lower: number | null; upper: number | null; min: number | null; both: number | null } {
  if (sd <= 0) {
    return { lower: null, upper: null, min: null, both: null };
  }
  const lower = lsl == null ? null : (mean - lsl) / (3 * sd);
  const upper = usl == null ? null : (usl - mean) / (3 * sd);
  const min =
    lower == null ? upper : upper == null ? lower : Math.min(lower, upper);
  const both =
    lsl == null || usl == null ? null : (usl - lsl) / (6 * sd);
  return { lower, upper, min, both };
}

function expectedPpm(
  mean: number,
  sd: number,
  lsl: number | null,
  usl: number | null
): number | null {
  if (sd <= 0) return null;
  let ppm = 0;
  if (lsl != null) ppm += stdNormCdf((lsl - mean) / sd) * 1e6;
  if (usl != null) ppm += (1 - stdNormCdf((usl - mean) / sd)) * 1e6;
  return ppm;
}

function observedPpm(
  values: number[],
  lsl: number | null,
  usl: number | null
): number | null {
  if (lsl == null && usl == null) return null;
  let count = 0;
  for (const value of values) {
    if (lsl != null && value < lsl) count += 1;
    else if (usl != null && value > usl) count += 1;
  }
  return (count / values.length) * 1e6;
}

function capabilityIndices(
  values: number[],
  mean: number,
  overallStdev: number,
  withinStdev: number,
  config: CapabilitySixpackConfig
): CapabilityIndices {
  const { lsl, usl, target } = config;
  const within = pairIndices(mean, withinStdev, lsl, usl);
  const overall = pairIndices(mean, overallStdev, lsl, usl);
  return {
    lsl,
    usl,
    target,
    cp: within.both,
    cpk: within.min,
    cpl: within.lower,
    cpu: within.upper,
    pp: overall.both,
    ppk: overall.min,
    ppl: overall.lower,
    ppu: overall.upper,
    ppmWithin: expectedPpm(mean, withinStdev, lsl, usl),
    ppmOverall: expectedPpm(mean, overallStdev, lsl, usl),
    ppmObserved: observedPpm(values, lsl, usl),
    withinLow: mean - 3 * withinStdev,
    withinHigh: mean + 3 * withinStdev,
    overallLow: mean - 3 * overallStdev,
    overallHigh: mean + 3 * overallStdev,
  };
}

function chooseBinCount(n: number): number {
  return Math.min(30, Math.max(5, Math.ceil(Math.sqrt(n))));
}

function buildHistogram(
  values: number[],
  mean: number,
  overallStdev: number,
  withinStdev: number,
  lsl: number | null,
  usl: number | null
): CapabilitySixpackResult["histogram"] {
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const binCount = chooseBinCount(values.length);
  const span = maxValue - minValue || Math.abs(maxValue) || 1;
  const padding = span * 0.05;
  const start = minValue - padding;
  const end = maxValue + padding;
  const width = (end - start) / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    x0: start + i * width,
    x1: start + (i + 1) * width,
    count: 0,
  }));
  for (const value of values) {
    let index = Math.floor((value - start) / width);
    if (index < 0) index = 0;
    if (index >= binCount) index = binCount - 1;
    bins[index]!.count += 1;
  }

  const curveMin = Math.min(
    start,
    lsl ?? start,
    mean - 3.5 * Math.max(overallStdev, withinStdev)
  );
  const curveMax = Math.max(
    end,
    usl ?? end,
    mean + 3.5 * Math.max(overallStdev, withinStdev)
  );
  const curve: CurvePoint[] = [];
  const withinCurve: CurvePoint[] = [];
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const x = curveMin + ((curveMax - curveMin) * i) / steps;
    curve.push({
      x,
      y: normalPdf(x, mean, overallStdev) * values.length * width,
    });
    withinCurve.push({
      x,
      y: normalPdf(x, mean, withinStdev) * values.length * width,
    });
  }
  return { bins, overallCurve: curve, withinCurve };
}

function blomPlottingPosition(i: number, n: number): number {
  return (i - 0.375) / (n + 0.25);
}

function andersonDarling(values: number[], mean: number, sd: number): {
  ad: number;
  adStar: number;
  pValue: number;
} {
  const sorted = [...values].toSorted((a, b) => a - b);
  const n = sorted.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const Fi = clampProbability(normalCdf(sorted[i]!, mean, sd));
    const Frev = clampProbability(normalCdf(sorted[n - 1 - i]!, mean, sd));
    sum += (2 * i + 1) * (Math.log(Fi) + Math.log(1 - Frev));
  }
  const ad = -n - sum / n;
  const adStar = ad * (1 + 0.75 / n + 2.25 / (n * n));
  const pValue = andersonDarlingPValue(adStar);
  return { ad, adStar, pValue };
}

/** D'Agostino / Stephens / Minitab p-value approximation for AD*. */
export function andersonDarlingPValue(adStar: number): number {
  let p: number;
  if (adStar >= 0.6) {
    p = Math.exp(1.2937 - 5.709 * adStar + 0.0186 * adStar * adStar);
  } else if (adStar >= 0.34) {
    p = Math.exp(0.9177 - 4.279 * adStar - 1.38 * adStar * adStar);
  } else if (adStar > 0.2) {
    p = 1 - Math.exp(-8.318 + 42.796 * adStar - 59.938 * adStar * adStar);
  } else {
    p = 1 - Math.exp(-13.436 + 101.14 * adStar - 223.73 * adStar * adStar);
  }
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}

function buildNormalPlot(
  values: number[],
  mean: number,
  sd: number
): CapabilitySixpackResult["normalPlot"] {
  const sorted = [...values].toSorted((a, b) => a - b);
  const n = sorted.length;
  const points: ProbabilityPlotPoint[] = [];
  const lowerBand: ProbabilityPlotPoint[] = [];
  const upperBand: ProbabilityPlotPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = blomPlottingPosition(i + 1, n);
    const z = stdNormInv(p);
    const value = sorted[i]!;
    points.push({ z, value });
    const density = Math.max(normalPdf(z, 0, 1), 1e-12);
    const se = sd * Math.sqrt((p * (1 - p)) / n) / density;
    const fitted = mean + sd * z;
    lowerBand.push({ z, value: fitted - 1.96 * se });
    upperBand.push({ z, value: fitted + 1.96 * se });
  }
  const z0 = points[0]?.z ?? -2;
  const z1 = points[n - 1]?.z ?? 2;
  return {
    points,
    lineStart: { z: z0, value: mean + sd * z0 },
    lineEnd: { z: z1, value: mean + sd * z1 },
    lowerBand,
    upperBand,
    ...andersonDarling(values, mean, sd),
  };
}

function validateSpecs(config: CapabilitySixpackConfig): SixpackComputeOutcome | null {
  const { lsl, usl, target } = config;
  if (lsl == null && usl == null) {
    return {
      ok: false,
      code: "invalid_specs",
      message: "Enter a lower spec, an upper spec, or both.",
    };
  }
  if (lsl != null && usl != null && !(lsl < usl)) {
    return {
      ok: false,
      code: "invalid_specs",
      message: "Lower spec must be less than upper spec.",
    };
  }
  if (target != null) {
    if (lsl != null && target < lsl) {
      return {
        ok: false,
        code: "invalid_specs",
        message: "Target must be at least the lower spec.",
      };
    }
    if (usl != null && target > usl) {
      return {
        ok: false,
        code: "invalid_specs",
        message: "Target must be at most the upper spec.",
      };
    }
  }
  return null;
}

export function computeCapabilitySixpackFromValues(
  values: number[],
  skipped: number,
  config: CapabilitySixpackConfig
): SixpackComputeOutcome {
  const specError = validateSpecs(config);
  if (specError) return specError;
  if (values.length < MIN_VALUES_FOR_SIXPACK) {
    return {
      ok: false,
      code: "too_few_values",
      message: `Need at least ${MIN_VALUES_FOR_SIXPACK} numeric observations in the selected data.`,
    };
  }

  const mean = meanOf(values);
  const overallStdev = sampleStdev(values, mean);
  if (overallStdev === 0) {
    return {
      ok: false,
      code: "zero_variance",
      message: "All numeric values are identical, so capability cannot be estimated.",
    };
  }

  const ranges = movingRanges(values);
  const mrBar = meanOf(ranges);
  const withinStdev = mrBar === 0 ? overallStdev : mrBar / IMR_CONSTANTS.d2;
  const iUcl = mean + IMR_CONSTANTS.E2 * mrBar;
  const iLcl = mean - IMR_CONSTANTS.E2 * mrBar;
  const mrUcl = IMR_CONSTANTS.D4 * mrBar;
  const mrLcl = IMR_CONSTANTS.D3 * mrBar;

  const result: CapabilitySixpackResult = {
    n: values.length,
    skipped,
    mean,
    overallStdev,
    withinStdev,
    mrBar,
    individuals: controlSeries(values, mean, iUcl, iLcl),
    movingRange: controlSeries(ranges, mrBar, mrUcl, mrLcl),
    lastObservations: values.slice(-25),
    histogram: buildHistogram(
      values,
      mean,
      overallStdev,
      withinStdev,
      config.lsl,
      config.usl
    ),
    normalPlot: buildNormalPlot(values, mean, overallStdev),
    capability: capabilityIndices(
      values,
      mean,
      overallStdev,
      withinStdev,
      config
    ),
  };

  return { ok: true, result };
}

export function computeCapabilitySixpack(
  worksheet: WorksheetData,
  config: CapabilitySixpackConfig
): SixpackComputeOutcome {
  const column = findColumn(worksheet, config.columnId);
  if (!column) {
    return {
      ok: false,
      code: "too_few_values",
      message: "The selected column was not found in the worksheet.",
    };
  }
  const { values, skipped } = columnNumericValues(
    column,
    normalizeRowSelection(config)
  );
  return computeCapabilitySixpackFromValues(values, skipped, {
    ...config,
    columnName: column.name,
  });
}

export { indexFromSpecs, meanOf, movingRanges, sampleStdev };
