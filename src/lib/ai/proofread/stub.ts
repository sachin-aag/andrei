import { hashProofreadText } from "@/lib/proofread/hash";
import type { ProofreadIssue, ProofreadUnit } from "@/lib/ai/proofread/types";

/** Avoid matching the already-fixed spelling `don't`. */
const DONT_RE = /\bdont\b(?!')/;

/**
 * Deterministic issues for Playwright / local stub runs.
 * Mirrors the screenshot: `dont` → `don't`.
 */
export function stubProofreadIssues(units: ProofreadUnit[]): ProofreadIssue[] {
  const issues: ProofreadIssue[] = [];
  for (const unit of units) {
    const match = unit.text.match(DONT_RE);
    if (!match || match.index == null) continue;
    const deleteText = match[0]!;
    issues.push({
      id: `${hashProofreadText(unit.text)}:${deleteText}`,
      unitId: unit.id,
      unitHash: hashProofreadText(unit.text),
      severity: "grammar",
      deleteText,
      insertText: "don't",
      anchorText: unit.text.slice(
        Math.max(0, match.index - 40),
        Math.min(unit.text.length, match.index + deleteText.length + 40)
      ),
      label: "don't",
    });
  }
  return issues;
}
