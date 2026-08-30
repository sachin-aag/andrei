export function formatStat(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(value)) return "*";
  if (Object.is(value, -0)) return (0).toFixed(Math.min(digits, 2));
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) {
    return value.toExponential(2);
  }
  return value.toFixed(digits);
}

/** Sixpack Process Capability table — three decimals so values stay on one line. */
export function formatCapabilityStat(
  value: number | null | undefined
): string {
  return formatStat(value, 3);
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

export function formatSpecSummary(config: {
  lsl: number | null;
  usl: number | null;
  target: number | null;
}): string {
  const parts: string[] = [];
  if (config.lsl != null) parts.push(`LSL ${formatLimit(config.lsl)}`);
  if (config.target != null) parts.push(`Target ${formatLimit(config.target)}`);
  if (config.usl != null) parts.push(`USL ${formatLimit(config.usl)}`);
  return parts.join(" · ");
}
