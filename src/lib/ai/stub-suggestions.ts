import type { SectionType } from "@/db/schema";
import type { RawSuggestion } from "@/lib/ai/suggest";
import stubSuggestionsJson from "@/lib/ai/fixtures/stub-suggestions.json";

type StubSuggestionEntry = RawSuggestion & { section: SectionType };

const stubsBySection = new Map<SectionType, RawSuggestion[]>();
for (const entry of stubSuggestionsJson as StubSuggestionEntry[]) {
  const { section, ...suggestion } = entry;
  const list = stubsBySection.get(section) ?? [];
  list.push(suggestion);
  stubsBySection.set(section, list);
}

export function getStubSuggestionsForSection(
  section: SectionType,
  allowedCriterionKeys: Set<string>
): RawSuggestion[] {
  const sectionStubs = stubsBySection.get(section) ?? [];
  return sectionStubs.filter((s) => allowedCriterionKeys.has(s.criterionKey));
}

/** Validates stub suggestions have required anchor/delete/insert fields. */
export function assertStubSuggestionsShape(): void {
  for (const entry of stubSuggestionsJson as StubSuggestionEntry[]) {
    if (
      typeof entry.criterionKey !== "string" ||
      typeof entry.targetField !== "string" ||
      typeof entry.anchorText !== "string" ||
      typeof entry.deleteText !== "string" ||
      typeof entry.insertText !== "string" ||
      typeof entry.reasoning !== "string"
    ) {
      throw new Error(`Invalid stub suggestion shape for ${entry.criterionKey}`);
    }
    if (!entry.deleteText.trim() && !entry.insertText.trim()) {
      throw new Error(
        `Stub suggestion ${entry.criterionKey} must have deleteText or insertText`
      );
    }
  }
}
