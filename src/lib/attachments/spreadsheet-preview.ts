import {
  parseCsvBuffer,
  parseXlsxBuffer,
  type SpreadsheetDocument,
  type SpreadsheetSheet,
} from "@/lib/attachments/spreadsheet-parse";

const PREVIEW_MAX_ROWS = 500;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sheetHtml(sheet: SpreadsheetSheet): string {
  const truncated = sheet.rows.length > PREVIEW_MAX_ROWS;
  const rows = sheet.rows.slice(0, PREVIEW_MAX_ROWS);
  const head = sheet.columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join("");
  const body = rows
    .map((row) => {
      const cells = sheet.columns
        .map((_, index) => `<td>${escapeHtml(row[index] ?? "")}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  const note = truncated
    ? `<p class="note">Showing the first ${PREVIEW_MAX_ROWS} of ${sheet.rows.length} rows. Download the file to see the rest.</p>`
    : "";
  return `<section>
<h1>${escapeHtml(sheet.name)}</h1>
${note}
<table>
<thead><tr>${head}</tr></thead>
<tbody>${body}</tbody>
</table>
</section>`;
}

function documentToPreviewHtml(
  document: SpreadsheetDocument,
  title: string
): string {
  const body = document.sheets.map(sheetHtml).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; background: #ffffff; }
  body {
    color: #1a1a1a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.45;
    padding: 24px 32px 48px;
  }
  h1 { font-size: 1.15rem; margin: 1.4em 0 0.6em; }
  section + section { margin-top: 2em; }
  table { border-collapse: collapse; width: max-content; min-width: 100%; margin: 0 0 1em; }
  th, td { border: 1px solid #d0d0d0; padding: 5px 9px; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; font-weight: 600; }
  .note { color: #5c5c5c; font-size: 13px; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

export async function spreadsheetBufferToPreviewHtml(
  kind: "csv" | "xlsx",
  buffer: Buffer,
  options: { title?: string } = {}
): Promise<string> {
  const document =
    kind === "csv" ? parseCsvBuffer(buffer) : await parseXlsxBuffer(buffer);
  return documentToPreviewHtml(document, options.title ?? "Spreadsheet preview");
}
