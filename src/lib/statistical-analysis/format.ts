export function formatStat(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "*";
  if (Object.is(value, -0)) return (0).toFixed(Math.min(digits, 2));
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) {
    return value.toExponential(2);
  }
  return value.toFixed(digits);
}

export function formatPValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "*";
  if (value < 0.001) return "<0.001";
  if (value > 0.999) return ">0.999";
  return value.toFixed(3);
}

export function formatPpm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "*";
  if (value >= 100) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

export function formatLimit(value: number): string {
  return formatStat(value, 2);
}
