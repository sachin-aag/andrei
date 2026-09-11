/**
 * Axis windows shared by the on-screen SVG charts and the Excel export, so a
 * plot and its exported twin frame the same data. Excel auto-scales when a
 * chart carries no explicit min/max, which is how the two drifted apart.
 */

/** Y padding per chart family — the SVG view and the Excel export share these. */
export const CONTROL_CHART_AXIS_PAD = 0.12;
export const ANOVA_AXIS_PAD = 0.12;
export const PROBABILITY_PLOT_AXIS_PAD = 0.08;

/** Padded [min, max] around a value set. Empty falls back to [-1, 1]. */
export function paddedDomain(values: number[], pad = 0.08): [number, number] {
  if (values.length === 0) return [-1, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  return [min - span * pad, max + span * pad];
}

/**
 * Tick spacing for a domain the SVG charts label at min / midpoint / max.
 * Excel takes a `majorUnit`, not a tick list.
 */
export function midpointMajorUnit(min: number, max: number): number {
  const span = max - min;
  return span > 0 ? span / 2 : 1;
}

/** Nice 1-2-5 step at or below `raw`. */
export function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(raw) || 1));
  const scaled = raw / magnitude;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * magnitude;
}
