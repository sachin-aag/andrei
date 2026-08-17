import type { ProtocolParserConfig } from "./types";
import type { ScopeEntry } from "./types";
import { extractRequirementIds } from "./ids";

type ReleaseSlice = { release: string; text: string };

function softwareScopeSlices(
  planText: string,
  config: ProtocolParserConfig
): ReleaseSlice[] {
  const headings = config.plan.releaseHeadings;
  const starts = headings.map((h) => planText.search(h.heading));
  if (starts.some((s) => s < 0)) return [];

  const firmwareAfterLast = planText.search(config.plan.firmwareStop);
  const slices: ReleaseSlice[] = [];
  for (let i = 0; i < headings.length; i++) {
    const start = starts[i];
    const nextStart = starts[i + 1];
    const end =
      nextStart !== undefined
        ? nextStart
        : firmwareAfterLast > start
          ? firmwareAfterLast
          : planText.length;
    slices.push({ release: headings[i].release, text: planText.slice(start, end) });
  }
  return slices;
}

function entriesFromTable(
  text: string,
  release: string,
  config: ProtocolParserConfig
): ScopeEntry[] {
  const entries: ScopeEntry[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\n/)) {
    if (config.plan.ignoreLine?.test(line)) continue;
    const jMatch = line.match(config.plan.jCodeLineEnd);
    if (!jMatch) continue;
    const jCode = jMatch[1];
    const ids = extractRequirementIds(line, config.requirementId);
    for (const reqId of ids) {
      const key = `${reqId}::${release}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        reqId,
        release,
        jCode,
        requiredConfigs: config.plan.requiredConfigsFor(jCode),
      });
    }
  }
  return entries;
}

export function parseTestPlan(
  planText: string,
  config: ProtocolParserConfig
): ScopeEntry[] {
  return softwareScopeSlices(planText, config).flatMap((slice) =>
    entriesFromTable(slice.text, slice.release, config)
  );
}
