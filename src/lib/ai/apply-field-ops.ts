import { createId } from "@paralleldrive/cuid2";
import type { FieldOp } from "@/lib/ai/suggested-fix";
import { normalizeBracketPlaceholdersInPlainText } from "@/lib/placeholders/normalize-bracket-placeholders";

function normalizeFieldOpValue(value: unknown): unknown {
  if (typeof value === "string") {
    return normalizeBracketPlaceholdersInPlainText(value);
  }
  return value;
}

function normalizeAppendPayload(value: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    out[key] =
      typeof raw === "string" ? normalizeBracketPlaceholdersInPlainText(raw) : raw;
  }
  return out;
}

const FORBIDDEN_PATH_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

/**
 * Parse a path like `sixM.man` or `correctiveActions[0].dueDate` into segments.
 * Numeric bracket indices become numbers. Returns null if malformed or if
 * a segment would enable prototype pollution.
 */
export function parsePath(path: string): Array<string | number> | null {
  if (!path || typeof path !== "string") return null;
  const segments: Array<string | number> = [];
  const parts = path.split(".");
  for (const part of parts) {
    if (!part) return null;
    const indexed = part.match(/^([^\[\]]+)((?:\[\d+\])*)$/);
    if (!indexed) return null;
    const head = indexed[1];
    if (!head || FORBIDDEN_PATH_SEGMENTS.has(head)) return null;
    segments.push(head);
    const tail = indexed[2];
    if (tail) {
      const indices = tail.match(/\[\d+\]/g) ?? [];
      for (const ix of indices) {
        const n = Number.parseInt(ix.slice(1, -1), 10);
        if (!Number.isFinite(n) || n < 0) return null;
        segments.push(n);
      }
    }
  }
  return segments;
}

/**
 * Set a leaf at `path` on `root`. Does not auto-vivify parents. Returns false
 * if the parent path does not resolve to an existing container, or array index
 * is out of range.
 */
export function setNestedPath(
  root: Record<string, unknown>,
  path: string,
  value: unknown
): boolean {
  const segments = parsePath(path);
  if (!segments || segments.length === 0) return false;

  let cursor: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (cursor == null || typeof cursor !== "object") return false;
    if (typeof seg === "number") {
      if (!Array.isArray(cursor)) return false;
      cursor = cursor[seg];
    } else {
      if (Array.isArray(cursor)) return false;
      const obj = cursor as Record<string, unknown>;
      if (!(seg in obj)) return false;
      cursor = obj[seg];
    }
  }
  const last = segments[segments.length - 1]!;
  if (cursor == null || typeof cursor !== "object") return false;
  if (typeof last === "number") {
    if (!Array.isArray(cursor)) return false;
    if (last < 0 || last >= cursor.length) return false;
    (cursor as unknown[])[last] = value;
  } else {
    if (Array.isArray(cursor)) return false;
    (cursor as Record<string, unknown>)[last] = value;
  }
  return true;
}

/**
 * Append an object to the array at `path`. Creates an empty array if the key
 * exists but is null. Injects `id` via `generateId` (strips any AI-supplied
 * `id` in `value` first). Returns false if the path is invalid or the target
 * is not an object parent.
 */
export function appendAtPath(
  root: Record<string, unknown>,
  path: string,
  value: Record<string, string>,
  generateId: () => string = createId
): boolean {
  const segments = parsePath(path);
  if (!segments || segments.length === 0) return false;

  let cursor: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (cursor == null || typeof cursor !== "object") return false;
    if (typeof seg === "number") {
      if (!Array.isArray(cursor)) return false;
      cursor = cursor[seg];
    } else {
      if (Array.isArray(cursor)) return false;
      const obj = cursor as Record<string, unknown>;
      if (!(seg in obj)) return false;
      cursor = obj[seg];
    }
  }
  const last = segments[segments.length - 1]!;
  if (cursor == null || typeof cursor !== "object" || Array.isArray(cursor)) {
    return false;
  }
  const parent = cursor as Record<string, unknown>;
  if (typeof last === "number") return false;
  const existing = parent[last];
  let arr: unknown[];
  if (Array.isArray(existing)) {
    arr = existing;
  } else if (existing == null) {
    arr = [];
    parent[last] = arr;
  } else {
    return false;
  }
  const cleaned: Record<string, string> = { ...value };
  delete cleaned.id;
  const item: Record<string, string> = { id: generateId(), ...cleaned };
  arr.push(item);
  return true;
}

/**
 * Deep-clone `content`, apply field ops, return the new tree and whether any
 * op succeeded (malformed ops are silent-dropped).
 */
export function applyFieldOps(
  content: Record<string, unknown>,
  ops: FieldOp[],
  generateId: () => string = createId
): { next: Record<string, unknown>; anyApplied: boolean } {
  const next = JSON.parse(JSON.stringify(content)) as Record<string, unknown>;
  let anyApplied = false;
  for (const op of ops) {
    if (op.op === "set") {
      if (setNestedPath(next, op.path, normalizeFieldOpValue(op.value))) {
        anyApplied = true;
      }
    } else {
      if (appendAtPath(next, op.path, normalizeAppendPayload(op.value), generateId)) {
        anyApplied = true;
      }
    }
  }
  return { next, anyApplied };
}
