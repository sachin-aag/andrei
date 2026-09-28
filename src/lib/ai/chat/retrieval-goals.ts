/**
 * Parallel retrieval goals for one search. Each goal is one query arm
 * (`searchReportDocumentsMany` runs them together). A complete URS list
 * splits requirement families from the IQ/OQ/PQ files that hold each row's
 * reference. Other asks keep the model's own queries.
 */

export type RetrievalGoal = {
  goal: string;
  query: string;
};

export const RETRIEVAL_GOAL_CAP = 8;
const QUERY_MAX_CHARS = 500;

const URS_INVENTORY_RE =
  /\burs(?:es|s)?\b/i;

const URS_LIST_RE =
  /\b(?:complete|all|every|list|table\s*\d+|rtm|traceability|draft|fill|populate)\b/i;

const PROTOCOL_GOALS: readonly RetrievalGoal[] = [
  {
    goal: "Installation qualification references",
    query: "IQ installation qualification URS",
  },
  {
    goal: "Operational qualification references",
    query: "OQ operational qualification URS",
  },
  {
    goal: "Performance qualification references",
    query: "PQ performance qualification URS",
  },
];

const URS_SET_GOALS: readonly RetrievalGoal[] = [
  {
    goal: "URS requirement statements",
    query: "URS requirement",
  },
  {
    goal: "Process requirement URS set",
    query: "process requirements URS",
  },
  {
    goal: "Control philosophy URS set",
    query: "control philosophy URS",
  },
  {
    goal: "GMP and safety URS set",
    query: "GMP safety requirements URS",
  },
];

function clampQuery(query: string): string {
  const clean = query.replace(/\s+/g, " ").trim();
  if (clean.length <= QUERY_MAX_CHARS) return clean;
  return clean.slice(0, QUERY_MAX_CHARS).trim();
}

function ursIds(text: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/\bURS[-\s]?(\d+)\b/gi)) {
    const id = `URS-${match[1]}`;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function idBandGoals(ids: readonly string[]): RetrievalGoal[] {
  const goals: RetrievalGoal[] = [];
  const size = 8;
  for (let index = 0; index < ids.length; index += size) {
    const band = ids.slice(index, index + size);
    const first = band[0];
    const last = band[band.length - 1];
    if (!first || !last) continue;
    goals.push({
      goal: band.length === 1 ? first : `URS set ${first}–${last}`,
      query: band.join(" OR "),
    });
  }
  return goals;
}

function dedupe(goals: readonly RetrievalGoal[]): RetrievalGoal[] {
  const seen = new Set<string>();
  const out: RetrievalGoal[] = [];
  for (const goal of goals) {
    const query = clampQuery(goal.query);
    const key = query.toLowerCase();
    if (!query || seen.has(key)) continue;
    seen.add(key);
    out.push({ goal: goal.goal, query });
    if (out.length >= RETRIEVAL_GOAL_CAP) break;
  }
  return out;
}

export function isUrsInventoryRequest(text: string): boolean {
  return URS_INVENTORY_RE.test(text) && URS_LIST_RE.test(text);
}

/**
 * Goals for a URS inventory. Empty for any other search, so a batch-number
 * lookup stays one query.
 */
export function planRetrievalGoals(text: string): RetrievalGoal[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!isUrsInventoryRequest(clean)) return [];
  const bands = idBandGoals(ursIds(clean));
  return dedupe([
    { goal: "The request", query: clean },
    ...(bands.length > 0 ? bands : URS_SET_GOALS),
    ...PROTOCOL_GOALS,
  ]);
}

export function retrievalQueriesForSearch(input: {
  userText?: string;
  query?: string;
  queries?: readonly string[];
  /** Later grep rounds keep the model's query. The fan-out already ran. */
  excludePages?: readonly unknown[];
}): { goals: RetrievalGoal[]; queries: string[] } {
  const modelQueries = [...(input.queries ?? [])];
  if (input.query) modelQueries.unshift(input.query);
  if (input.excludePages && input.excludePages.length > 0) {
    return { goals: [], queries: modelQueries };
  }
  const goals = planRetrievalGoals(
    [input.userText ?? "", ...modelQueries].join("\n")
  );
  if (goals.length === 0) return { goals: [], queries: modelQueries };
  return { goals, queries: goals.map((goal) => goal.query) };
}
