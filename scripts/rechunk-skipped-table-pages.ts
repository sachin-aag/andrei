/**
 * Re-chunk active ingest runs whose long-table interiors were skipped but
 * carry page-specific identifiers. Does not re-extract pages.
 *
 *   pnpm db:rechunk-skipped-table-pages -- --dry-run
 *   pnpm db:rechunk-skipped-table-pages
 */
import { config } from "dotenv";
import { rechunkIdentifierSkippedTablePages } from "../src/lib/attachments/rechunk-skipped-table-pages";

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { candidates, rechunked } = await rechunkIdentifierSkippedTablePages({
    dryRun,
  });
  if (candidates.length === 0) {
    console.log("No active runs need identifier-aware rechunk.");
    return;
  }
  for (const candidate of candidates) {
    console.log(
      `${candidate.filename} (${candidate.runId}): pages ${candidate.pages.join(", ")}`
    );
  }
  if (dryRun) {
    console.log(`Dry run: ${candidates.length} run(s) would be re-chunked.`);
    return;
  }
  console.log(`Re-chunked ${rechunked} of ${candidates.length} run(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
