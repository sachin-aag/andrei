import type { SectionType } from "@/db/schema";
import { isChatEditableSection, sectionLabel } from "@/lib/ai/chat/fields";
import type { ReadyDocumentIndexItem } from "@/lib/attachments/retrieval";

/**
 * Documents retrieved per turn is the real cost driver, so cap document
 * mentions. Section mentions are bounded by the editable section list.
 */
export const CHAT_MAX_DOCUMENT_MENTIONS = 5;

/** Upper bound on raw client input before validation. */
const MAX_RAW_MENTIONS = 50;

export type ChatMentionType = "document" | "section";

/**
 * An @ mention as sent by the client. Only the id is trusted — the display
 * label in the message text is user-editable and never used for lookup.
 */
export type ChatMention =
  | { type: "document"; id: string }
  | { type: "section"; id: SectionType };

export type ResolvedDocumentMention = {
  attachmentId: string;
  filename: string;
  description: string | null;
  pageCount: number | null;
};

export type ResolvedSectionMention = {
  section: SectionType;
  label: string;
};

export type ResolvedChatMentions = {
  documents: ResolvedDocumentMention[];
  sections: ResolvedSectionMention[];
  /** Mentions that no longer resolve (deleted, still processing, or foreign). */
  droppedCount: number;
};

export const EMPTY_CHAT_MENTIONS: ResolvedChatMentions = {
  documents: [],
  sections: [],
  droppedCount: 0,
};

function isMentionType(value: unknown): value is ChatMentionType {
  return value === "document" || value === "section";
}

/**
 * Validate and dedupe the client's mention list. Shape errors drop the single
 * bad entry rather than failing the turn — a stale mention should never cost
 * the engineer their message.
 */
export function parseChatMentions(value: unknown): ChatMention[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const mentions: ChatMention[] = [];

  for (const raw of value.slice(0, MAX_RAW_MENTIONS)) {
    if (!raw || typeof raw !== "object") continue;
    const { type, id } = raw as { type?: unknown; id?: unknown };
    if (!isMentionType(type) || typeof id !== "string") continue;

    const trimmed = id.trim();
    if (!trimmed) continue;
    if (type === "section" && !isChatEditableSection(trimmed)) continue;

    const key = `${type}:${trimmed}`;
    if (seen.has(key)) continue;
    seen.add(key);

    mentions.push(
      type === "section"
        ? { type: "section", id: trimmed as SectionType }
        : { type: "document", id: trimmed }
    );
  }

  return mentions;
}

/**
 * Resolve mentions against the report's own ready documents. Attachment IDs
 * are matched against this report's index only, so a mention cannot pull
 * evidence from another report.
 */
export function resolveChatMentions(
  mentions: ChatMention[],
  readyDocuments: ReadyDocumentIndexItem[]
): ResolvedChatMentions {
  if (mentions.length === 0) return EMPTY_CHAT_MENTIONS;

  const byId = new Map(readyDocuments.map((doc) => [doc.attachmentId, doc]));
  const documents: ResolvedDocumentMention[] = [];
  const sections: ResolvedSectionMention[] = [];
  let droppedCount = 0;

  for (const mention of mentions) {
    if (mention.type === "section") {
      sections.push({ section: mention.id, label: sectionLabel(mention.id) });
      continue;
    }

    const doc = byId.get(mention.id);
    if (!doc) {
      droppedCount++;
      continue;
    }
    if (documents.length >= CHAT_MAX_DOCUMENT_MENTIONS) {
      droppedCount++;
      continue;
    }
    documents.push({
      attachmentId: doc.attachmentId,
      filename: doc.filename,
      description: doc.description,
      pageCount: doc.pageCount,
    });
  }

  return { documents, sections, droppedCount };
}

export function mentionedAttachmentIds(resolved: ResolvedChatMentions): string[] {
  return resolved.documents.map((doc) => doc.attachmentId);
}

export function mentionedSections(
  resolved: ResolvedChatMentions
): SectionType[] {
  return resolved.sections.map((entry) => entry.section);
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).trimEnd()}…`;
}

/**
 * Prompt block naming what the engineer tagged. Deliberately an index, not
 * document text — retrieval still happens just-in-time through the tools.
 */
export function buildMentionBlock(resolved: ResolvedChatMentions): string {
  const { documents, sections, droppedCount } = resolved;
  if (documents.length === 0 && sections.length === 0 && droppedCount === 0) {
    return "";
  }

  const lines = [
    "## Tagged by the engineer (@ mentions)",
    "The engineer tagged these for this request. Treat them as the primary focus.",
  ];

  if (documents.length > 0) {
    lines.push(
      'Documents — search_documents is already scoped to these; pass scope="all" if they yield nothing useful:'
    );
    for (const doc of documents) {
      const pages =
        typeof doc.pageCount === "number" && doc.pageCount > 0
          ? `${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}`
          : "page count unknown";
      const description = doc.description?.trim();
      lines.push(
        `- ${doc.filename} [${doc.attachmentId}] — ${pages}` +
          (description ? `; user context: ${truncate(description, 280)}` : "")
      );
    }
  }

  if (sections.length > 0) {
    lines.push("Sections — read them with read_section before answering:");
    for (const entry of sections) {
      lines.push(`- ${entry.label} [${entry.section}]`);
    }
  }

  if (droppedCount > 0) {
    lines.push(
      `Note: ${droppedCount} tagged document(s) are no longer available (deleted or still processing). Ask the engineer rather than guessing.`
    );
  }

  return lines.join("\n");
}
