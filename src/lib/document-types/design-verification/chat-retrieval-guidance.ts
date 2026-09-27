import type { DocumentChatRetrievalGuidance } from "../types";

/** Shared by the demo, Convergent, and mechanical design-verification types. */
export const DV_RETRIEVAL_GUIDANCE: DocumentChatRetrievalGuidance = {
  comprehensive: `- Draft the Results / Requirements Verified matrix from finish_document_review recommendedInventory only — not from allIdentifiers.
- Preserve each requirement ID exactly, including its family prefix and any dotted suffix (M3-SYS-FN-037 is not SYS-FN-037; SW-SST-5.1.1 is not SW-SST-5).`,
};
