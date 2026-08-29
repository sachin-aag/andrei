/** Feature flag for the P2 three-way merge path. Off until PR 4 flips it. */
export const SUGGESTION_THREE_WAY_MERGE = false;

export function isSuggestionThreeWayMergeEnabled(): boolean {
  return SUGGESTION_THREE_WAY_MERGE;
}
