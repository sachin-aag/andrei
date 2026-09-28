/**
 * Parallel retrieval goals for one search. A complete URS list is planned
 * from the URS-N ids stored on the URS file, then each band is searched in
 * the URS and again in the DQ / IQ / OQ / PQ files. When those ids are not
 * known yet, topic queries are the fallback. Any other ask keeps the
 * model's own queries.
 */

export type RetrievalFamily = "urs" | "dq" | "iq" | "oq" | "pq";

export type RetrievalGoal = {
  goal: string;
  query: string;
  family?: RetrievalFamily;
};

export const RETRIEVAL_GOAL_CAP = 8;
const QUERY_MAX_CHARS = 450;

const URS_INVENTORY_RE = /\burs(?:es|s)?\b/i;
const URS_LIST_RE =
  /\b(?:complete|all|every|list|table\s*\d+|rtm|traceability|draft|fill|populate)\b/i;

const FAMILY_LABEL: Record<RetrievalFamily, string> = {
  urs: "the URS",
  dq: "the DQ",
  iq: "the IQ",
  oq: "the OQ",
  pq: "the PQ",
};

const FAMILY_ORDER: readonly RetrievalFamily[] = ["urs", "iq", "oq", "pq", "dq"];

const TOPIC_FALLBACK: readonly RetrievalGoal[] = [
  {
    goal: "URS requirement statements",
    query: "URS requirement",
    family: "urs",
  },
  {
    goal: "Process requirement URS set",
    query: "process requirements URS",
    family: "urs",
  },
  {
    goal: "Control philosophy URS set",
    query: "control philosophy URS",
    family: "urs",
  },
  {
    goal: "GMP and safety URS set",
    query: "GMP safety requirements URS",
    family: "urs",
  },
  {
    goal: "Installation qualification references",
    query: "IQ installation qualification URS",
    family: "iq",
  },
  {
    goal: "Operational qualification references",
    query: "OQ operational qualification URS",
    family: "oq",
  },
  {
    goal: "Performance qualification references",
    query: "PQ performance qualification URS",
    family: "pq",
  },
];

function clampQuery(query: string): string {
  const clean = query.replace(/\s+/g, " ").trim();
  if (clean.length <= QUERY_MAX_CHARS) return clean;
  return clean.slice(0, QUERY_MAX_CHARS).trim();
}

export function sortUrsIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const match = raw.toUpperCase().match(/^URS-(\d+)$/);
    if (!match) continue;
    const id = `URS-${match[1]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
}

function idBands(ids: readonly string[]): string[][] {
  const bands: string[][] = [];
  let current: string[] = [];
  let length = 0;
  for (const id of ids) {
    const extra = (current.length > 0 ? 4 : 0) + id.length;
    if (current.length > 0 && length + extra > QUERY_MAX_CHARS) {
      bands.push(current);
      current = [id];
      length = id.length;
      continue;
    }
    current.push(id);
    length += extra;
  }
  if (current.length > 0) bands.push(current);
  return bands;
}

function dedupe(goals: readonly RetrievalGoal[]): RetrievalGoal[] {
  const seen = new Set<string>();
  const out: RetrievalGoal[] = [];
  for (const goal of goals) {
    const query = clampQuery(goal.query);
    const key = `${goal.family ?? ""}:${query.toLowerCase()}`;
    if (!query || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...goal, query });
    if (out.length >= RETRIEVAL_GOAL_CAP) break;
  }
  return out;
}

export function isUrsInventoryRequest(text: string): boolean {
  return URS_INVENTORY_RE.test(text) && URS_LIST_RE.test(text);
}

/** One band of real URS ids, searched in the URS and in each protocol family. */
export function structuralUrsGoals(ids: readonly string[]): RetrievalGoal[] {
  const sorted = sortUrsIds(ids);
  if (sorted.length === 0) return [];
  const goals: RetrievalGoal[] = [];
  for (const band of idBands(sorted)) {
    const first = band[0]!;
    const last = band[band.length - 1]!;
    const span = first === last ? first : `${first}–${last}`;
    const query = band.join(" OR ");
    for (const family of FAMILY_ORDER) {
      goals.push({
        goal: `${span} in ${FAMILY_LABEL[family]}`,
        query,
        family,
      });
      if (goals.length >= RETRIEVAL_GOAL_CAP) return goals;
    }
  }
  return goals;
}

function ursIdsInText(text: string): string[] {
  return sortUrsIds(text.match(/\bURS-\d+\b/gi) ?? []);
}

export function planRetrievalGoals(
  text: string,
  ursIds?: readonly string[]
): RetrievalGoal[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!isUrsInventoryRequest(clean)) return [];
  const structural = structuralUrsGoals([
    ...(ursIds ?? []),
    ...ursIdsInText(clean),
  ]);
  if (structural.length > 0) return structural;
  return dedupe([
    { goal: "The request", query: clean },
    ...TOPIC_FALLBACK,
  ]);
}

export function retrievalQueriesForSearch(input: {
  userText?: string;
  query?: string;
  queries?: readonly string[];
  /** Later grep rounds keep the model's query. The fan-out already ran. */
  excludePages?: readonly unknown[];
  ursIds?: readonly string[];
}): { goals: RetrievalGoal[]; queries: string[] } {
  const modelQueries = [...(input.queries ?? [])];
  if (input.query) modelQueries.unshift(input.query);
  if (input.excludePages && input.excludePages.length > 0) {
    return { goals: [], queries: modelQueries };
  }
  const goals = planRetrievalGoals(
    [input.userText ?? "", ...modelQueries].join("\n"),
    input.ursIds
  );
  if (goals.length === 0) return { goals: [], queries: modelQueries };
  return { goals, queries: goals.map((goal) => goal.query) };
}
