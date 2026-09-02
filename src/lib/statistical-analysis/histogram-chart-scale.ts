import {
  axisTickValues,
  niceAxisDomain,
  paddedExtent,
} from "@/lib/charts/axis-ticks";
import type { CurvePoint, HistogramBin } from "./types";

export type HistogramChartScale = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xTicks: number[];
  yTicks: number[];
};

/** Shared SVG + PNG scale: nice 1-2-5 ticks, not raw padded min/max. */
export function histogramChartScale(input: {
  bins: HistogramBin[];
  overallCurve: CurvePoint[];
  withinCurve: CurvePoint[];
  lsl: number | null;
  usl: number | null;
  showDistributionLines?: boolean;
  showLsl?: boolean;
  showUsl?: boolean;
}): HistogramChartScale {
  const showDistributionLines = input.showDistributionLines ?? true;
  const drawLsl = (input.showLsl ?? true) && input.lsl != null;
  const drawUsl = (input.showUsl ?? true) && input.usl != null;
  const curvePoints = showDistributionLines
    ? [...input.overallCurve, ...input.withinCurve]
    : [];
  const xValues = [
    ...input.bins.flatMap((bin) => [bin.x0, bin.x1]),
    ...curvePoints.map((point) => point.x),
    ...(drawLsl && input.lsl != null ? [input.lsl] : []),
    ...(drawUsl && input.usl != null ? [input.usl] : []),
  ].filter((value) => Number.isFinite(value));
  const paddedX = paddedExtent(xValues, 0.02);
  const xDomain = niceAxisDomain(paddedX.min, paddedX.max);
  const counts = input.bins.map((bin) => bin.count);
  const curveYs = curvePoints.map((point) => point.y);
  const yMaxRaw = Math.max(1, ...counts, ...curveYs) * 1.12;
  const yDomain = niceAxisDomain(0, yMaxRaw, { clampMin: 0 });
  return {
    xMin: xDomain.min,
    xMax: xDomain.max,
    yMin: yDomain.min,
    yMax: yDomain.max,
    xTicks: axisTickValues(xDomain.min, xDomain.max, xDomain.step),
    yTicks: axisTickValues(yDomain.min, yDomain.max, yDomain.step),
  };
}
