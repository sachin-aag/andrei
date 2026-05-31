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
