/**
 * Config-driven model sweep: runs the bulk eval for each model spec sequentially,
 * then auto-generates a comparison report.
 *
 *   pnpm run model-sweep
 *   pnpm run model-sweep -- --input-dir docs/sample_files --concurrency 4
 *
 * Requires in .env.local:
 *   GOOGLE_GENERATIVE_AI_API_KEY (google)
 *   OPENAI_API_KEY (openai)
 *   GOOGLE_VERTEX_PROJECT + ADC (vertex-anthropic)
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

import type { ModelSpec } from "@/lib/eval/model-resolver";

/* -------------------------------------------------------------------------- */
/*  Sweep configuration — edit this array to add/remove models                 */
/* -------------------------------------------------------------------------- */

const SWEEP_CONFIGS: ModelSpec[] = [
  // Vertex has no `gemini-3.1-flash` — use `gemini-3.5-flash` (GA) or `gemini-3-flash-preview` on global.
  { provider: "vertex", modelId: "gemini-3.1-flash-lite", temperature: 0, seed: 0, location: "global" },
  { provider: "openai", modelId: "gpt-5.5" },
  {
    provider: "vertex-anthropic",
    modelId: "claude-opus-4-7",
    location: "global",
  },
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

  const sweepDir = path.join(process.cwd(), "reports", `sweep_${ts}`);
  fs.mkdirSync(sweepDir, { recursive: true });
  console.error(`Sweep output directory: ${sweepDir}`);

  const jsonPaths: string[] = [];

  for (let i = 0; i < SWEEP_CONFIGS.length; i++) {
    const spec = SWEEP_CONFIGS[i];
    const label = `${spec.provider}_${spec.modelId}`.replace(/[^a-zA-Z0-9._-]/g, "_");
    const outFile = path.join(sweepDir, `${label}.html`);

    const args = [
      "scripts/eval/bulk-sample-evaluation-report.ts",
      "--provider", spec.provider,
      "--model-id", spec.modelId,
      ...(spec.temperature !== undefined
        ? ["--temperature", String(spec.temperature)]
        : []),
      ...(spec.effort && spec.effort !== "none"
        ? ["--effort", spec.effort]
        : []),
      ...(spec.location ? ["--location", spec.location] : []),
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

  // Generate comparison report in the same sweep folder
  const comparisonOut = path.join(sweepDir, "comparison.html");
  console.error(`\nGenerating comparison report from ${jsonPaths.length} runs...`);

  try {
    execFileSync("npx", [
      "tsx",
      "scripts/eval/compare-eval-runs.ts",
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
  console.error(`Output folder: ${sweepDir}`);
  console.error(`Comparison report: ${comparisonOut}`);
}

main();
