/**
 * Deterministic FNV-1a hash of arbitrary JSON-serializable content.
 *
 * Used by the auto-evaluation pipeline to detect whether a section's content
 * has changed since the last evaluation. Cheap, dependency-free, and stable
 * across client and server — we don't need cryptographic strength, only
 * collision resistance for "did this change?" comparisons.
 */
export function hashContent(value: unknown): string {
  const str = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortKeys);
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = sortKeys(obj[k]);
  return out;
}
