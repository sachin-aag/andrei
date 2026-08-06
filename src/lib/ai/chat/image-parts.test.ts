import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  CHAT_MAX_IMAGES_PER_MESSAGE,
  countImageParts,
  isAllowedChatImageMediaType,
  sanitizeChatMessagesForModel,
} from "./image-parts";

function userMessage(parts: UIMessage["parts"]): UIMessage {
  return {
    id: "m1",
    role: "user",
    parts,
  };
}

describe("chat image parts", () => {
  it("allows common image media types", () => {
    expect(isAllowedChatImageMediaType("image/png")).toBe(true);
    expect(isAllowedChatImageMediaType("image/jpeg")).toBe(true);
    expect(isAllowedChatImageMediaType("application/pdf")).toBe(false);
  });

  it("drops non-image file parts and keeps text", () => {
    const sanitized = sanitizeChatMessagesForModel([
      userMessage([
        { type: "text", text: "see this" },
        {
          type: "file",
          mediaType: "application/pdf",
          url: "data:application/pdf;base64,aaa",
          filename: "x.pdf",
        },
        {
          type: "file",
          mediaType: "image/png",
          url: "data:image/png;base64,iVBORw0KGgo=",
          filename: "shot.png",
        },
      ]),
    ]);

    expect(sanitized[0]?.parts).toEqual([
      { type: "text", text: "see this" },
      {
        type: "file",
        mediaType: "image/png",
        url: "data:image/png;base64,iVBORw0KGgo=",
        filename: "shot.png",
      },
    ]);
  });

  it("caps images on the latest user turn", () => {
    const images = Array.from({ length: CHAT_MAX_IMAGES_PER_MESSAGE + 2 }, (_, i) => ({
      type: "file" as const,
      mediaType: "image/jpeg",
      url: `data:image/jpeg;base64,${"aa".repeat(10)}${i}`,
      filename: `img-${i}.jpg`,
    }));

    const sanitized = sanitizeChatMessagesForModel([userMessage(images)]);
    expect(countImageParts(sanitized[0])).toBe(CHAT_MAX_IMAGES_PER_MESSAGE);
  });

  it("drops oversized data URLs", () => {
    const huge = `data:image/png;base64,${"a".repeat(900_000)}`;
    const sanitized = sanitizeChatMessagesForModel([
      userMessage([
        {
          type: "file",
          mediaType: "image/png",
          url: huge,
          filename: "big.png",
        },
      ]),
    ]);
    expect(sanitized[0]?.parts).toEqual([]);
  });
});
