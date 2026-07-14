import type { SectionType } from "@/db/schema";
import { type ChatSectionScope, sectionLabel } from "@/lib/ai/chat/fields";

type SectionPattern = {
  section: SectionType;
  patterns: RegExp[];
  weight: number;
};

const SECTION_PATTERNS: SectionPattern[] = [
  {
    section: "define",
    patterns: [
      /\bdefine\b/i,
      /\bproblem statement\b/i,
      /\bdeviation description\b/i,
      /\bwhat happened\b/i,
    ],
    weight: 3,
  },
  {
    section: "measure",
    patterns: [/\bmeasure\b/i, /\bmeasurement plan\b/i, /\bexperiment\b/i, /\bdata collection\b/i],
    weight: 3,
  },
  {
    section: "analyze",
    patterns: [
      /\banalyz/i,
      /\broot cause\b/i,
      /\b5[-\s]?why\b/i,
      /\bfishbone\b/i,
      /\b6m\b/i,
      /\bimpact assessment\b/i,
    ],
    weight: 3,
  },
  {
    section: "improve",
    patterns: [/\bimprove\b/i, /\bcorrective\b/i, /\bcapa\b/i, /\bcorrective action\b/i],
    weight: 3,
  },
  {
    section: "control",
    patterns: [/\bcontrol\b/i, /\bpreventive\b/i, /\bmonitoring\b/i, /\bpreventive action\b/i],
    weight: 3,
  },
  {
    section: "conclusion",
    patterns: [/\bconclusion\b/i, /\binvestigation outcome\b/i, /\bclosing summary\b/i],
    weight: 3,
  },
];

/** Best-effort section intent from the user's message (null if unclear). */
export function detectSectionIntentFromText(text: string): SectionType | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let best: { section: SectionType; score: number } | null = null;
  for (const { section, patterns, weight } of SECTION_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) score += weight;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { section, score };
    }
  }

  return best && best.score >= 3 ? best.section : null;
}

export type SectionScopeMismatch = {
  suggestedSection: SectionType;
  currentSection: SectionType;
  reason: string;
};

/** When a single section is selected, detect if the user message targets another. */
export function detectSectionScopeMismatch(
  currentScope: ChatSectionScope,
  userText: string
): SectionScopeMismatch | null {
  if (currentScope === "all") return null;

  const intent = detectSectionIntentFromText(userText);
  if (!intent || intent === currentScope) return null;

  return {
    suggestedSection: intent,
    currentSection: currentScope,
    reason: `This looks like a question about ${sectionLabel(intent)}, not ${sectionLabel(currentScope)}.`,
  };
}
