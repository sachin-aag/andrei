/**
 * Claims that assert more than evidence can carry.
 *
 * The grounding gate checks whether a *number, date or identifier* appears on
 * a cited page. It says nothing about the shape of the sentence around it, so
 * two kinds of overstatement pass it cleanly:
 *
 * - **Permanence.** "permanently fixed", "will not recur", "completely
 *   eliminates the risk". An investigation can show an action was taken and
 *   that no recurrence was seen over some window. It cannot show that a cause
 *   is gone forever, and in a regulated report that claim invites a finding.
 * - **Unbounded scope.** "all historical batches met all specifications" when
 *   the evidence covers two of them. Every word may be individually sourced
 *   while the quantifier is not.
 *
 * Neither is pack-specific — an overclaim is as wrong on demo as on MJ — so
 * this is deliberately not gated on `unsupportedFactPolicy`.
 */

export type OverclaimKind = "permanence" | "unbounded_scope";

export type Overclaim = {
  kind: OverclaimKind;
  /** The matched wording, for the model to locate and rewrite. */
  phrase: string;
  guidance: string;
};

const PERMANENCE_GUIDANCE =
  "State what was done and what has been observed since, over a named window — not that the problem is gone for good. Write \"corrected\" not \"permanently corrected\"; \"no recurrence in the 3 batches since\" not \"will not recur\".";

const SCOPE_GUIDANCE =
  "Name the set you actually checked and cite it. Write \"the 3 batches reviewed (…) met their release specifications\" — not \"all batches met all specifications\".";

/**
 * Wordings that assert a permanent or absolute outcome. Each is matched whole
 * so ordinary use of the same verbs ("the valve was corrected") is untouched.
 */
const PERMANENCE_PATTERNS: RegExp[] = [
  /\bpermanent(?:ly)?\s+(?:fix(?:ed|es)?|resolv(?:ed|es)?|correct(?:ed|s)?|eliminat(?:ed|es)?|prevent(?:ed|s)?|rectif(?:ied|ies)?|clos(?:ed|es)?)\b/gi,
  /\bpermanent\s+(?:fix|solution|correction|resolution|remedy|closure)\b/gi,
  /\b(?:completely|fully|entirely|totally|100%)\s+(?:eliminat\w+|prevent\w+|remov\w+|resolv\w+|mitigat\w+)\b/gi,
  /\bwill\s+(?:never|not\s+ever)\s+(?:recur|reoccur|occur\s+again|happen\s+again)\b/gi,
  /\b(?:cannot|can\s+not|could\s+not)\s+(?:recur|reoccur|occur\s+again|happen\s+again)\b/gi,
  /\bwill\s+not\s+(?:recur|reoccur|occur\s+again|happen\s+again)\b/gi,
  /\b(?:guarantee|guarantees|guaranteed|ensure|ensures|ensured)\s+(?:that\s+)?(?:no|zero|none)\b/gi,
  /\beliminat\w+\s+(?:any|all|the)\s+(?:possibility|possibilities|risk|risks|chance|recurrence)\b/gi,
  /\b100\s*%\s+(?:effective|compliant|accurate|reliable|successful)\b/gi,
  /\bno\b[^.;]{0,40}\bwhatsoever\b/gi,
];

/** A universal quantifier over an evidence set. */
const UNIVERSAL_QUANTIFIER =
  /\b(?:all|every|each|any\s+and\s+all|none\s+of\s+the)\s+(?:\w+\s+){0,3}(?:batch(?:es)?|lots?|samples?|units?|tests?|results?|parameters?|specifications?|attributes?|cycles?|vials?|runs?|readings?)\b/i;

/** A compliance verdict. Paired with the quantifier above, the claim is universal. */
const COMPLIANCE_PREDICATE =
  /\b(?:met|meets|complied|complies|conform\w*|passed|satisfactory|acceptable|unaffected|were\s+within|was\s+within|within\s+(?:the\s+)?(?:specification|specifications|limits?|ranges?|acceptance))\b|\bno\s+adverse\b/i;

/** Sentence split that keeps bullet lines apart, since drafts are markdown. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.;:!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function detectOverclaims(text: string): Overclaim[] {
  if (!text.trim()) return [];
  const found: Overclaim[] = [];

  for (const pattern of PERMANENCE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const phrase = match[0]?.trim();
      if (phrase) {
        found.push({
          kind: "permanence",
          phrase,
          guidance: PERMANENCE_GUIDANCE,
        });
      }
    }
  }

  for (const sentence of sentences(text)) {
    if (!UNIVERSAL_QUANTIFIER.test(sentence)) continue;
    if (!COMPLIANCE_PREDICATE.test(sentence)) continue;
    const quantified = sentence.match(UNIVERSAL_QUANTIFIER)?.[0]?.trim();
    found.push({
      kind: "unbounded_scope",
      // The quantifier is the fix site; the whole sentence is often a bullet.
      phrase: quantified ?? sentence.slice(0, 120),
      guidance: SCOPE_GUIDANCE,
    });
  }

  return uniqueBy(found, (item) => `${item.kind}|${item.phrase.toLowerCase()}`);
}

export function permanenceClaims(items: readonly Overclaim[]): Overclaim[] {
  return items.filter((item) => item.kind === "permanence");
}

export function unboundedScopeClaims(
  items: readonly Overclaim[]
): Overclaim[] {
  return items.filter((item) => item.kind === "unbounded_scope");
}

function quoteList(items: readonly Overclaim[]): string {
  return items.map((item) => `"${item.phrase}"`).join(", ");
}

/** Message for the non-persisting bounce on a permanence claim. */
export function permanenceBounceMessage(items: readonly Overclaim[]): string {
  return (
    `This draft was not saved. It claims a permanent or absolute outcome: ${quoteList(items)}. ` +
    PERMANENCE_GUIDANCE +
    " Rewrite those words and call the tool again with the rest of the draft unchanged."
  );
}

/** Warning attached to a saved draft that quantifies over a whole set. */
export function unboundedScopeWarning(items: readonly Overclaim[]): string {
  return (
    `Check the scope of ${quoteList(items)} before telling the engineer this is done. ` +
    SCOPE_GUIDANCE +
    " If the evidence covers only part of the set, say which part."
  );
}
