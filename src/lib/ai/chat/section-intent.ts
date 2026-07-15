import type { SectionType } from "@/db/schema";
import { type ChatSectionScope, sectionLabel } from "@/lib/ai/chat/fields";

const SECTION_PATTERNS: [SectionType, RegExp[]][] = [
  [
    "define",
    [
      /\bdefine\b/i,
      /\bproblem statement\b/i,
      /\bdeviation description\b/i,
      /\bwhat happened\b/i,
    ],
  ],
  [
    "measure",
    [/\bmeasure\b/i, /\bmeasurement plan\b/i, /\bexperiment\b/i, /\bdata collection\b/i],
  ],
  [
    "analyze",
    [
      /\banalyz/i,
      /\broot cause\b/i,
      /\b5[-\s]?why\b/i,
      /\bfishbone\b/i,
      /\b6m\b/i,
      /\bimpact assessment\b/i,
    ],
  ],
  [
    "improve",
    [/\bimprove\b/i, /\bcorrective\b/i, /\bcapa\b/i, /\bcorrective action\b/i],
  ],
  [
    "control",
    [/\bcontrol\b/i, /\bpreventive\b/i, /\bmonitoring\b/i, /\bpreventive action\b/i],
  ],
  [
    "conclusion",
    [/\bconclusion\b/i, /\binvestigation outcome\b/i, /\bclosing summary\b/i],
  ],
];

/** Best-effort section intent from the user's message (null if unclear). */
export function detectSectionIntentFromText(text: string): SectionType | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let match: { section: SectionType; count: number } | null = null;
  for (const [section, patterns] of SECTION_PATTERNS) {
    const count = patterns.reduce(
      (total, pattern) => total + Number(pattern.test(trimmed)),
      0
    );
    if (count > 0 && (!match || count > match.count)) {
      match = { section, count };
    }
  }
  return match?.section ?? null;
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
