/**
 * Runs the real ingest text path over a PDF and reports what the table
 * detector recovers from it.
 *
 * This is the check that gates Phase 1.2/1.3 of
 * `docs/ds-report-instrument-data-plan.md`. The parser was validated against
 * Google Drive's text extraction, which is NOT what the app uses: ingest goes
 * through `readPdfTextLayer` (unpdf), whose whitespace handling and page
 * boundaries may differ. If `usable` is false, ingest falls to the vision path
 * and the parser never runs at all.
 *
 *   pnpm check-table-extract <file.pdf> [...more.pdf]
 *
 * Exit code is non-zero when a file has no usable text layer or yields no
 * table, so this can gate CI later.
 */
import fs from "node:fs";
import path from "node:path";
import {
  classifyPdfExtractLayout,
  readPdfTextLayer,
} from "@/lib/attachments/pdf-text-layer";
import { detectTables } from "@/lib/attachments/table-extract";

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error("usage: pnpm check-table-extract <file.pdf> [...]");
  process.exit(2);
}

async function main() {
  let failures = 0;

    for (const file of files) {
    const name = path.basename(file);
    if (!fs.existsSync(file)) {
      console.error(`${name}: not found`);
      failures += 1;
      continue;
    }

    const buffer = fs.readFileSync(file);
    const layer = await readPdfTextLayer(buffer);
    const layout = classifyPdfExtractLayout(layer);
    const chars = layer.pages.reduce((n, p) => n + p.text.length, 0);
    const thin = layer.pages.filter((p) => p.text.length < 180).length;

    console.log(`\n${name}`);
    console.log(
      `  text layer: pages=${layer.pages.length} usable=${layer.usable} ` +
        `layout=${layout} chars=${chars} thin-pages=${thin}`
    );

    if (!layer.usable) {
      // Ingest would send this to the vision path, so the parser never sees it.
      console.log(
        `  -> NOT usable. ${thin} page(s) under the 180-char floor; ` +
          `the table parser will not run on this file during ingest.`
      );
      failures += 1;
    }

    const tables = detectTables(
      layer.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }))
    );

    if (tables.length === 0) {
      console.log("  -> no repeating table grammar found");
      failures += 1;
      continue;
    }

    tables.slice(0, 3).forEach((t, i) => {
      console.log(
        `  table ${i + 1}: rows=${t.rows.length} cols=${t.columns.length} ` +
          `pages=${t.pageStart}-${t.pageEnd} sig=${t.signature}`
      );
      console.log(
        `    ${t.columns.map((c) => `${c.name}:${c.type}`).join("  ")}`
      );
      const first = t.rows[0];
      const last = t.rows[t.rows.length - 1];
      if (first) console.log(`    first: ${first.values.join(" ")}`);
      if (last) console.log(`    last:  ${last.values.join(" ")}`);
    });
    if (tables.length > 3) {
      console.log(`  (+${tables.length - 3} smaller table(s))`);
    }
  }
  console.log(
    failures === 0
      ? "\nAll files produced a usable text layer and at least one table."
      : `\n${failures} file(s) failed. See above.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
