import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = [join(process.cwd(), "src"), join(process.cwd(), "scripts")];

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walkTsFiles(path, acc);
      continue;
    }
    if (!/\.tsx?$/.test(name) && !/\.mjs$/.test(name)) continue;
    if (/\.test\.tsx?$/.test(name)) continue;
    acc.push(path);
  }
  return acc;
}

function quotedDeprecatedCalls(source: string): string[] {
  const hits: string[] = [];
  const patterns = [
    /["'`][^"'`]*\/api\/public\/traces[^"'`]*/g,
    /["'`][^"'`]*\/api\/public\/observations(?!\/v2)[^"'`]*/g,
  ];
  for (const pattern of patterns) {
    const matches = source.match(pattern);
    if (matches) hits.push(...matches);
  }
  return hits.filter((hit) => !hit.includes("/api/public/v2/"));
}

describe("Langfuse deprecated public API guard", () => {
  it("does not call GET /api/public/traces or observations v1 from src or scripts", () => {
    const files = ROOTS.flatMap((root) => walkTsFiles(root));
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const hits = quotedDeprecatedCalls(source);
      if (hits.length > 0) {
        offenders.push(`${file}: ${hits.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
