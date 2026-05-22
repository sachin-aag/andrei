/**
 * Config-driven model sweep: runs the bulk eval for each model spec sequentially,
 * then auto-generates a comparison report.
 *
 *   npm run model-sweep
 *   npm run model-sweep -- --input-dir docs/sample_files --concurrency 4
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

import type { ModelSpec } from "@/lib/ai/model-resolver";

/* -------------------------------------------------------------------------- */
/*  Sweep configuration — edit this array to add/remove models                 */
/* -------------------------------------------------------------------------- */

const SWEEP_CONFIGS: ModelSpec[] = [
  { provider: "google", modelId: "gemini-3.1-flash-lite", temperature: 0, seed: 0 },
  { provider: "google", modelId: "gemini-3.1-flash", temperature: 0, seed: 0 },
  { provider: "vertex", modelId: "claude-sonnet-4", temperature: 0 },
  { provider: "openai", modelId: "gpt-4.1", temperature: 0 },
];

/* -------------------------------------------------------------------------- */
/*  CLI pass-through args                                                      */
/* -------------------------------------------------------------------------- */

function parsePassthroughArgs(argv: string[]): string[] {
  // Forward --input-dir, --concurrency, --report-date to each bulk eval run
  const passthrough: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (
      (a === "--input-dir" || a === "--concurrency" || a === "-j" || a === "--report-date") &&
      argv[i + 1]
    ) {
      passthrough.push(a, argv[++i]);
    }
  }
  return passthrough;
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                       */
/* -------------------------------------------------------------------------- */

function main() {
  const passthrough = parsePassthroughArgs(process.argv.slice(2));

  const ts = (() => {
    const n = new Date();
    const yyyy = n.getFullYear();
    const mm = String(n.getMonth() + 1).padStart(2, "0");
    const dd = String(n.getDate()).padStart(2, "0");
    const hh = String(n.getHours()).padStart(2, "0");
    const mi = String(n.getMinutes()).padStart(2, "0");
    const ss = String(n.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}_${hh}${mi}${ss}`;
  })();

  const reportsDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const jsonPaths: string[] = [];

  for (let i = 0; i < SWEEP_CONFIGS.length; i++) {
    const spec = SWEEP_CONFIGS[i];
    const label = `${spec.provider}_${spec.modelId}`.replace(/[^a-zA-Z0-9._-]/g, "_");
    const outFile = path.join(reportsDir, `sweep_${ts}_${label}.html`);

    const args = [
      "scripts/bulk-sample-evaluation-report.ts",
      "--provider", spec.provider,
      "--model-id", spec.modelId,
      "--temperature", String(spec.temperature),
      "--out", outFile,
      ...passthrough,
    ];

    console.error(`\n[${ i + 1}/${SWEEP_CONFIGS.length}] Running: ${spec.provider}/${spec.modelId}`);
    console.error(`  Command: tsx ${args.join(" ")}`);

    try {
      execFileSync("npx", ["tsx", ...args], {
        stdio: "inherit",
        cwd: process.cwd(),
        env: process.env,
      });
    } catch (err) {
      console.error(`  FAILED: ${spec.provider}/${spec.modelId}`);
      console.error(err instanceof Error ? err.message : String(err));
      console.error("  Continuing with remaining models...\n");
      continue;
    }

    const jsonPath = outFile.replace(/\.html$/, ".eval.json");
    if (fs.existsSync(jsonPath)) {
      jsonPaths.push(jsonPath);
    } else {
      console.error(`  Warning: expected JSON sidecar not found at ${jsonPath}`);
    }
  }

  if (jsonPaths.length < 2) {
    console.error("\nFewer than 2 successful runs — skipping comparison report.");
    process.exit(jsonPaths.length === 0 ? 1 : 0);
  }

  // Generate comparison report
  const comparisonOut = path.join(reportsDir, `sweep_comparison_${ts}.html`);
  console.error(`\nGenerating comparison report from ${jsonPaths.length} runs...`);

  try {
    execFileSync("npx", [
      "tsx",
      "scripts/compare-eval-runs.ts",
      "--out", comparisonOut,
      ...jsonPaths,
    ], {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
    });
  } catch (err) {
    console.error("Comparison report generation failed:");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.error(`\nSweep complete. ${jsonPaths.length} runs compared.`);
  console.error(`Comparison report: ${comparisonOut}`);
}

main();
