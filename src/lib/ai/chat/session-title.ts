export const UNTITLED_SESSION = "New chat";

/** First line of the first user message, trimmed to a short session title. */
export function deriveSessionTitle(text: string): string {
  const firstLine =
    text.split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? "";
  const collapsed = firstLine.replace(/\s+/g, " ").trim();
  if (!collapsed) return UNTITLED_SESSION;
  return collapsed.length <= 60 ? collapsed : `${collapsed.slice(0, 57).trimEnd()}…`;
}
