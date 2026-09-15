/**
 * Phrase-aware FTS / ILIKE planning for attachment grep.
 *
 * `websearch_to_tsquery` treats unquoted space as AND and `or` as OR.
 * Quoted phrases stay intact so "media fill" cannot match `filling` via
 * English stemming. OR is only used inside a phrase family.
 */

const FTS_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "which",
  "who",
  "with",
]);

const TOKEN_RE = /[A-Za-z0-9]/;

export type SearchQueryPlan = {
  original: string;
  tsQuery: string | null;
  phrases: string[];
  tokens: string[];
  families: string[][];
};

export function parseQuotedPhrases(input: string): {
  phrases: string[];
  rest: string;
} {
  const phrases: string[] = [];
  const rest = input.replace(/"([^"]+)"/g, (_, captured: string) => {
    const phrase = captured.replace(/\s+/g, " ").trim();
    if (phrase) phrases.push(phrase);
    return " ";
  });
  return { phrases, rest: rest.replace(/\s+/g, " ").trim() };
}

export function searchContentTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 0 &&
        TOKEN_RE.test(token) &&
        !FTS_STOPWORDS.has(token.toLowerCase())
    );
}

export function quoteWebsearchPhrase(phrase: string): string {
  return `"${phrase.replace(/"/g, "").replace(/\s+/g, " ").trim()}"`;
}

function normalizeFamilyTerm(term: string): string {
  return term.replace(/"/g, "").replace(/\s+/g, " ").trim();
}

export function familyTouchesQuery(
  query: string,
  family: readonly string[]
): boolean {
  const haystack = query.toLowerCase();
  const tokens = searchContentTokens(query).map((token) => token.toLowerCase());
  return family.some((term) => {
    const needle = normalizeFamilyTerm(term).toLowerCase();
    if (!needle) return false;
    if (haystack.includes(needle)) return true;
    // Query "monitoring" should expand "monitoring parameter" without
    // letting short stems (`fill`) unlock an unrelated family.
    const words = needle.split(/[^a-z0-9]+/).filter(Boolean);
    return tokens.some(
      (token) => token.length >= 8 && words.includes(token)
    );
  });
}

function orFamily(terms: readonly string[]): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const normalized = normalizeFamilyTerm(term);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(
      /[\s-]/.test(normalized)
        ? quoteWebsearchPhrase(normalized)
        : normalized
    );
  }
  return unique.join(" or ");
}

export function planSearchQuery(
  trimmed: string,
  options?: { families?: readonly (readonly string[])[] }
): SearchQueryPlan {
  const original = trimmed.replace(/\s+/g, " ").trim();
  const inputFamilies = (options?.families ?? []).map((family) =>
    family.map((term) => normalizeFamilyTerm(term)).filter(Boolean)
  );
  if (!original) {
    return { original, tsQuery: null, phrases: [], tokens: [], families: [] };
  }

  const parsed = parseQuotedPhrases(original);
  const tokens = searchContentTokens(parsed.rest);
  const phrases = [...parsed.phrases];
  if (parsed.phrases.length === 0 && tokens.length === 2) {
    phrases.push(tokens.join(" "));
  }

  const parts: string[] = [];
  const usedFamily = new Set<number>();

  const pushFamilyOrPhrase = (text: string) => {
    const idx = inputFamilies.findIndex(
      (family, index) => !usedFamily.has(index) && familyTouchesQuery(text, family)
    );
    if (idx >= 0) {
      usedFamily.add(idx);
      const family = inputFamilies[idx]!;
      parts.push(`(${orFamily([...family, text])})`);
      return;
    }
    parts.push(quoteWebsearchPhrase(text));
  };

  if (phrases.length > 0) {
    for (const phrase of phrases) pushFamilyOrPhrase(phrase);
    const extra = tokens.filter(
      (token) =>
        !phrases.some((phrase) =>
          phrase.toLowerCase().includes(token.toLowerCase())
        )
    );
    if (extra.length > 0) parts.push(extra.join(" "));
  } else if (tokens.length > 0) {
    const tokenParts: string[] = [];
    for (const token of tokens) {
      const idx = inputFamilies.findIndex(
        (family, index) =>
          !usedFamily.has(index) && familyTouchesQuery(token, family)
      );
      if (idx >= 0) {
        usedFamily.add(idx);
        tokenParts.push(`(${orFamily(inputFamilies[idx]!)})`);
      } else {
        tokenParts.push(token);
      }
    }
    parts.push(tokenParts.join(" "));
  } else {
    const idx = inputFamilies.findIndex((family) =>
      familyTouchesQuery(original, family)
    );
    if (idx >= 0) {
      usedFamily.add(idx);
      parts.push(`(${orFamily(inputFamilies[idx]!)})`);
    }
  }

  const tsQuery = parts.length > 0 ? parts.join(" ") : null;
  const families = inputFamilies.filter((_, index) => usedFamily.has(index));
  return { original, tsQuery, phrases, tokens, families };
}

/** Tokenize a retrieval query for `websearch_to_tsquery`. Null = skip keyword arm. */
export function buildKeywordTsQuery(
  trimmed: string,
  families?: readonly (readonly string[])[]
): string | null {
  return planSearchQuery(trimmed, { families }).tsQuery;
}

/** ILIKE / regex needles: phrases first, then leftover content tokens. */
export function lexicalSearchNeedles(plan: SearchQueryPlan): {
  phrases: string[];
  tokens: string[];
} {
  const familyPhrases = plan.families.flatMap((family) =>
    family.filter((term) => /[\s-/]/.test(term) || term.length > 4)
  );
  const uniquePhrases: string[] = [];
  for (const phrase of [...plan.phrases, ...familyPhrases]) {
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (uniquePhrases.some((existing) => existing.toLowerCase() === key)) {
      continue;
    }
    uniquePhrases.push(phrase);
  }
  return {
    phrases: uniquePhrases,
    tokens: uniquePhrases.length > 0 ? [] : plan.tokens,
  };
}
