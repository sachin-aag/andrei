import { readFileSync } from "node:fs";
import path from "node:path";

export const FIXTURE_DIR = path.join(
  process.cwd(),
  "src/lib/design-inputs/fixtures"
);

export function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

export function readSrsFixture(): string {
  return readFixture("822-00007-Rev-AC.txt");
}

export function readPlanFixture(): string {
  return readFixture("790-00155-Rev-X.txt");
}

export function readProtocolFixture(): string {
  return readFixture("790-00134-Rev-V.txt");
}
