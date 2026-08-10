import mammoth from "mammoth";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Force non-fragment anchors to open in a new tab so clicks don't replace the
 * sandboxed preview iframe. In-document `#` links stay in-frame.
 */
export function openAnchorsInNewTab(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (full, rawAttrs: string) => {
    const hrefMatch = rawAttrs.match(
      /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
    );
    const href = (hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "").trim();
    if (!href || href.startsWith("#")) {
      return full;
    }

    const attrs = rawAttrs
      .replace(/\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s+rel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return `<a${attrs} target="_blank" rel="noopener noreferrer">`;
  });
}

/**
 * Convert a `.docx` buffer into a self-contained, read-only HTML document for
 * inline preview. mammoth inlines images as `data:` URIs, so the result needs
 * no external resources. Intended to be served with a strict CSP and rendered
 * inside a sandboxed iframe (no scripts) — this is a viewer, not an editor.
 */
export async function docxBufferToPreviewHtml(
  buffer: Buffer,
  options: { title?: string } = {}
): Promise<string> {
  const { value: bodyHtml } = await mammoth.convertToHtml({ buffer });
  const title = escapeHtml(options.title ?? "Document preview");
  const safeBodyHtml = openAnchorsInNewTab(bodyHtml);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; background: #ffffff; }
  body {
    color: #1a1a1a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.6;
    padding: 32px 40px;
    max-width: 880px;
    margin: 0 auto;
  }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.4em 0 0.5em; }
  p { margin: 0 0 0.9em; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #d0d0d0; padding: 6px 10px; text-align: left; vertical-align: top; }
  ul, ol { padding-left: 1.4em; }
  a { color: #2d2a6e; }
</style>
</head>
<body>
${safeBodyHtml}
</body>
</html>`;
}
