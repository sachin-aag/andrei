/**
 * Strip empty HTML snippets Mammoth leaves in markdown/plain text when
 * converting Word DOCX (internal bookmark anchors, etc.).
 */
export function stripWordBookmarkAnchors(text: string): string {
  return text
    .replace(/<a\s+id="[^"]*"\s*>\s*<\/a>/gi, "")
    .replace(/<a\s+id='[^']*'\s*>\s*<\/a>/gi, "");
}
