import type { CommentRecord } from "@/types/report";
import { parseAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import type { BlockChain, BlockChainEntry } from "@/lib/suggestions/block-redraft";

/**
 * Index the section's block suggestions by id so a chained insert can ask where
 * its predecessor ended up.
 *
 * A multi-block draft arrives as an ordered chain: block 2 goes after block 1,
 * block 3 after block 2. Nothing about that chain is positional — the queue can
 * be worked out of order, individual blocks rejected, and the surrounding text
 * edited by hand between accepts — so the insertion point is derived from the
 * chain's *current* state each time a card becomes active.
 */
export function buildBlockChain(comments: readonly CommentRecord[]): BlockChain {
  const chain = new Map<string, BlockChainEntry>();
  for (const comment of comments) {
    if (comment.kind !== "ai_fix") continue;
    const blockEdit = parseAiFixCommentContent(comment.content).blockEdit;
    if (!blockEdit) continue;
    chain.set(comment.id, {
      id: comment.id,
      status: comment.status,
      proposedMarkdown: blockEdit.proposedMarkdown,
      afterSuggestionId: blockEdit.afterSuggestionId,
    });
  }
  return chain;
}
