/**
 * Regularized incomplete beta I_x(a, b) via Lentz continued fraction
 * (Numerical Recipes), plus F and Student-t tails used by one-way ANOVA.
 */

const LANCZOS_P = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877783015, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
] as const;

function logGamma(z: number): number {
  if (!(z > 0) || !Number.isFinite(z)) return Number.NaN;
  if (z < 0.5) {
    return (
      Math.log(Math.PI) -
      Math.log(Math.sin(Math.PI * z)) -
      logGamma(1 - z)
    );
  }
  const n = z - 1;
  let x = LANCZOS_P[0]!;
  for (let i = 1; i < LANCZOS_P.length; i++) {
    x += LANCZOS_P[i]! / (n + i);
  }
  const t = n + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (n + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIt = 200;
  const eps = 3e-12;
  const fpMin = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpMin) d = fpMin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIt; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) return h;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b) = B_x(a, b) / B(a, b). */
export function regularizedIncompleteBeta(
  x: number,
  a: number,
  b: number
): number {
  if (!(a > 0 && b > 0) || !Number.isFinite(a) || !Number.isFinite(b)) {
    return Number.NaN;
  }
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBt =
    logGamma(a + b) -
    logGamma(a) -
    logGamma(b) +
    a * Math.log(x) +
    b * Math.log(1 - x);
  const bt = Math.exp(lnBt);
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** P(F_{d1,d2} ≤ f) = I_{d1 f / (d1 f + d2)}(d1/2, d2/2). */
export function fCdf(f: number, d1: number, d2: number): number {
  if (!(d1 > 0 && d2 > 0) || !Number.isFinite(d1) || !Number.isFinite(d2)) {
    return Number.NaN;
  }
  if (f === Number.POSITIVE_INFINITY) return 1;
  if (!Number.isFinite(f) || f <= 0) return 0;
  const x = (d1 * f) / (d1 * f + d2);
  return regularizedIncompleteBeta(x, d1 / 2, d2 / 2);
}

/** ANOVA p-value: P(F_{d1,d2} > f) = I_{d2 / (d2 + d1 f)}(d2/2, d1/2). */
export function fSurvival(f: number, d1: number, d2: number): number {
  if (!(d1 > 0 && d2 > 0) || !Number.isFinite(d1) || !Number.isFinite(d2)) {
    return Number.NaN;
  }
  if (f === Number.POSITIVE_INFINITY) return 0;
  if (!Number.isFinite(f) || f <= 0) return 1;
  const x = d2 / (d2 + d1 * f);
  return regularizedIncompleteBeta(x, d2 / 2, d1 / 2);
}

/** Two-tailed Student-t p-value: P(|T_ν| > t) = I_{ν / (ν + t²)}(ν/2, 1/2). */
export function studentTTwoTailedP(t: number, df: number): number {
  if (!(df > 0) || !Number.isFinite(df)) return Number.NaN;
  if (t === Number.POSITIVE_INFINITY || t === Number.NEGATIVE_INFINITY) return 0;
  if (!Number.isFinite(t)) return Number.NaN;
  const absT = Math.abs(t);
  if (absT === 0) return 1;
  const x = df / (df + absT * absT);
  return regularizedIncompleteBeta(x, df / 2, 0.5);
}

/**
 * Two-sided Student-t critical value: t_{df, 1 − α/2} such that
 * P(|T| > t) = twoTailedAlpha. Used for 95% CIs when alpha is 0.05.
 */
export function studentTCritical(df: number, twoTailedAlpha: number): number {
  if (!(df > 0) || !Number.isFinite(df)) return Number.NaN;
  if (!(twoTailedAlpha > 0 && twoTailedAlpha < 1)) return Number.NaN;
  let lo = 0;
  let hi = 1;
  while (studentTTwoTailedP(hi, df) > twoTailedAlpha) {
    hi *= 2;
    if (hi > 1e8) return hi;
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (studentTTwoTailedP(mid, df) > twoTailedAlpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
