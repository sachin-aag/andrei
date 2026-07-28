/** Read a string field from section JSON by dot path (e.g. `correctiveActions`). */
export function getPlainTextFieldValue(
  content: Record<string, unknown>,
  path: string
): string {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = content;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object" || Array.isArray(cur)) return "";
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : "";
}

/** Write a string field at a dot path (returns a cloned section record). */
export function setPlainTextFieldValue(
  content: Record<string, unknown>,
  path: string,
  value: string
): Record<string, unknown> {
  const next = structuredClone(content);
  const parts = path.split(".").filter(Boolean);
  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const child = cursor[key];
    if (!child || typeof child !== "object" || Array.isArray(child)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
  return next;
}
