import type { UIMessage } from "ai";
import { isChatImageFilePart } from "@/lib/ai/chat/image-parts";
import { isValidSuggestionImageSrc } from "@/lib/suggestions/image-insert";
import type { SuggestionImageInsert } from "@/lib/suggestions/image-insert";

export type ChatImageSource = {
  source: "chat";
  /** 1-based index among images on the latest user message. */
  index: number;
};

export type SectionImageSource = {
  source: "section";
  /** Defaults to the field being edited. */
  section?: string;
  targetField?: string;
  /** 1-based index among imageInline nodes in that field. */
  index: number;
};

export type InsertImageSource = ChatImageSource | SectionImageSource;

export type ListedChatImage = {
  index: number;
  mediaType: string;
  alt: string;
};

export function listLatestUserChatImages(
  messages: UIMessage[]
): Array<{ index: number; src: string; alt: string; mediaType: string }> {
  let latest: UIMessage | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      latest = messages[i]!;
      break;
    }
  }
  if (!latest?.parts) return [];
  const listed: Array<{
    index: number;
    src: string;
    alt: string;
    mediaType: string;
  }> = [];
  for (const part of latest.parts) {
    if (!isChatImageFilePart(part)) continue;
    if (!isValidSuggestionImageSrc(part.url)) continue;
    listed.push({
      index: listed.length + 1,
      src: part.url,
      alt: typeof part.filename === "string" ? stripExtension(part.filename) : "",
      mediaType: part.mediaType,
    });
  }
  return listed;
}

export function resolveChatImage(
  messages: UIMessage[],
  index: number
):
  | { ok: true; image: SuggestionImageInsert }
  | { ok: false; message: string; available: ListedChatImage[] } {
  const listed = listLatestUserChatImages(messages);
  const available = listed.map(({ index: i, mediaType, alt }) => ({
    index: i,
    mediaType,
    alt,
  }));
  const hit = listed.find((img) => img.index === index);
  if (!hit) {
    return {
      ok: false,
      message:
        listed.length === 0
          ? "The latest user message has no attached images. Ask the engineer to attach a photo in chat, or copy a figure already in the section with source=section."
          : `No chat image at index ${index}. Latest user message has ${listed.length} image${listed.length === 1 ? "" : "s"} (index 1–${listed.length}).`,
      available,
    };
  }
  return {
    ok: true,
    image: { src: hit.src, alt: hit.alt || null, width: null, mediaId: null },
  };
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").trim();
}
