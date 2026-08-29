/**
 * Scratch renderer for visual sign-off of agent charts.
 * Run: `pnpm exec tsx scripts/render-chart-fixture.ts`
 * Output: tmp/torque-mock-chart.png
 */
import fs from "node:fs";
import path from "node:path";
import { TORQUE_MOCK_SPEC } from "../src/lib/charts/__fixtures__/torque-mock";
import { renderChartPng } from "../src/lib/charts/render-chart";

async function main() {
  const result = await renderChartPng(TORQUE_MOCK_SPEC, { packId: "demo" });
  if ("error" in result) {
    console.error(`renderChartPng failed: ${result.error}`);
    process.exit(1);
  }
  const match = /^data:image\/png;base64,(.+)$/.exec(result.dataUrl);
  if (!match) {
    console.error("renderChartPng did not return a PNG data URL");
    process.exit(1);
  }
  const outDir = path.join(process.cwd(), "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "torque-mock-chart.png");
  fs.writeFileSync(outPath, Buffer.from(match[1]!, "base64"));
  console.log(
    `Wrote ${outPath} (${result.rasterWidthPx}×${result.rasterHeightPx}, display ${result.widthPx}px)`
  );
}

void main();
