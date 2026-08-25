/**
 * Only one AI suggestion is previewed at a time. Any other AI preview in the
 * same field is neutralised so the reviewer reads one proposal at a time: its
 * inserted run is hidden (it is a proposal, not text yet) and its struck-through
 * run reads as ordinary prose.
 *
 * Every selector is scoped to `[data-suggestion-author="ai"]`. Human
 * track-change marks carry an id too, so unscoped rules would hide the
 * reviewer's own typing — the text stays in the document and saves, but never
 * appears on screen.
 */
export function buildInactiveSuggestionCss(
  activeSuggestionId: string | null
): string {
  if (!activeSuggestionId) return "";

  const otherAiRun = `[data-active-suggestion-id="${activeSuggestionId}"] [data-suggestion-author="ai"][data-eval-id]:not([data-eval-id="${activeSuggestionId}"])`;

  return `
${otherAiRun}.suggestion-insert,
${otherAiRun}.suggestion-insert-ai,
${otherAiRun}.suggestion-insert-ai::before,
${otherAiRun}.suggestion-insert-ai::after,
${otherAiRun}.suggestion-image-insert,
${otherAiRun}.suggestion-image-insert-ai {
  display: none !important;
  content: none !important;
}
${otherAiRun}.suggestion-delete,
${otherAiRun}.suggestion-delete-ai {
  text-decoration: none !important;
  background-color: transparent !important;
  color: inherit !important;
}
${otherAiRun}.suggestion-image-delete,
${otherAiRun}.suggestion-image-delete-ai {
  outline: none !important;
  background-color: transparent !important;
  box-shadow: none !important;
}
${otherAiRun}.suggestion-image-delete-ai .tiptap-image-inline {
  opacity: 1 !important;
}
[data-active-suggestion-id="${activeSuggestionId}"] .suggestion-action-widget:not([data-eval-id="${activeSuggestionId}"]) {
  display: none !important;
}
`;
}
