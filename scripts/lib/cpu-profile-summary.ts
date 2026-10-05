/**
 * Summarize a Chrome DevTools CPU profile (CDP Profiler.stop) for CLI output.
 */
export type CpuProfileNode = {
  id: number;
  callFrame: {
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  children?: number[];
};

export type CpuProfile = {
  nodes: CpuProfileNode[];
  samples: number[];
  timeDeltas: number[];
  startTime: number;
  endTime: number;
};

function shortUrl(u: string): string {
  return u.replace(/^.*\/_next\/static\/chunks\//, "").replace(/\?.*$/, "").slice(-70);
}

function nodeKey(n: CpuProfileNode): string {
  return `${n.callFrame.functionName || "(anon)"}  ${shortUrl(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`;
}

export function summarizeCpuProfile(profile: CpuProfile, options?: { topSelf?: number; topTotalApp?: number }) {
  const topSelf = options?.topSelf ?? 30;
  const topTotalApp = options?.topTotalApp ?? 40;

  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) {
    for (const c of n.children ?? []) parent.set(c, n.id);
  }

  const self = new Map<number, number>();
  profile.samples.forEach((id, i) => {
    self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0));
  });

  const selfByFn = new Map<string, number>();
  const totalByFn = new Map<string, number>();
  let busy = 0;

  for (const [id, us] of self) {
    const n = byId.get(id);
    if (!n) continue;
    const fn = n.callFrame.functionName;
    if (fn === "(idle)" || fn === "(program)" || fn === "(root)") continue;
    busy += us;
    const k = nodeKey(n);
    selfByFn.set(k, (selfByFn.get(k) ?? 0) + us);
    const seen = new Set<string>();
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
      const curNode = byId.get(cur);
      if (!curNode) break;
      const tk = nodeKey(curNode);
      if (seen.has(tk)) continue;
      seen.add(tk);
      totalByFn.set(tk, (totalByFn.get(tk) ?? 0) + us);
    }
  }

  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, us]) => `${(us / 1000).toFixed(0).padStart(7)}ms  ${k}`);

  const appTotal = new Map(
    [...totalByFn].filter(
      ([k]) => /src_|components|lib_|providers|hooks/.test(k) && !/node_modules/.test(k)
    )
  );

  return {
    busyUs: busy,
    topSelfTime: top(selfByFn, topSelf),
    topTotalAppTime: top(appTotal, topTotalApp),
  };
}
