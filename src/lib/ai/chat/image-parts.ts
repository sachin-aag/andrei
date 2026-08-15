import { isFileUIPart, type FileUIPart, type UIMessage, type UIMessagePart } from "ai";

/** Max images a user may attach to one chat turn. */
export const CHAT_MAX_IMAGES_PER_MESSAGE = 3;

/** Max binary size after compression for a chat image (~keeps request under platform body limits). */
export const CHAT_IMAGE_MAX_BYTES = 400_000;

/** Approximate max data-URL length for a compressed chat image (base64 expansion). */
export const CHAT_IMAGE_MAX_DATA_URL_CHARS = Math.ceil(CHAT_IMAGE_MAX_BYTES * 1.4) + 64;

const ALLOWED_CHAT_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function isAllowedChatImageMediaType(mediaType: string): boolean {
  const normalized = mediaType.trim().toLowerCase();
  return ALLOWED_CHAT_IMAGE_TYPES.has(normalized);
}

export function isChatImageFilePart(part: unknown): part is FileUIPart {
  if (!part || typeof part !== "object") return false;
  if (!("type" in part) || part.type !== "file") return false;
  if (!isFileUIPart(part as UIMessagePart<never, never>)) return false;
  return isAllowedChatImageMediaType(
    (part as FileUIPart).mediaType
  );
}

function isOversizedDataUrl(url: string): boolean {
  if (!url.startsWith("data:")) return false;
  return url.length > CHAT_IMAGE_MAX_DATA_URL_CHARS;
}

/**
 * Keep only valid, sized image file parts so convertToModelMessages can pass
 * them to Gemini as vision context. Non-image files and oversized data URLs
 * are dropped. Caps images on the latest user turn.
 */
export function sanitizeChatMessagesForModel(
  messages: UIMessage[]
): UIMessage[] {
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  return messages.map((message, index) => {
    const parts = message.parts ?? [];
    const kept: typeof parts = [];
    let imageCount = 0;

    for (const part of parts) {
      if (part.type === "file") {
        if (!isChatImageFilePart(part)) continue;
        if (isOversizedDataUrl(part.url)) continue;
        if (index === lastUserIndex && imageCount >= CHAT_MAX_IMAGES_PER_MESSAGE) {
          continue;
        }
        imageCount += 1;
        kept.push(part);
        continue;
      }
      kept.push(part);
    }

    if (kept.length === parts.length) return message;
    return { ...message, parts: kept };
  });
}

export function countImageParts(message: UIMessage | null | undefined): number {
  if (!message?.parts) return 0;
  return message.parts.filter((part) => isChatImageFilePart(part)).length;
}
