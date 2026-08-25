import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { listLatestUserChatImages, resolveChatImage } from "./insert-image";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG = `data:image/png;base64,${TINY_PNG}`;

function userWithImages(urls: string[]): UIMessage {
  return {
    id: "u1",
    role: "user",
    parts: urls.map((url, i) => ({
      type: "file" as const,
      mediaType: "image/png",
      filename: `shot-${i + 1}.png`,
      url,
    })),
  };
}

describe("resolveChatImage", () => {
  it("lists 1-based images on the latest user message", () => {
    const messages: UIMessage[] = [
      userWithImages([PNG]),
      { id: "a", role: "assistant", parts: [{ type: "text", text: "ok" }] },
      userWithImages([PNG, PNG]),
    ];
    const listed = listLatestUserChatImages(messages);
    expect(listed).toHaveLength(2);
    expect(listed[0]!.index).toBe(1);
    expect(listed[0]!.alt).toBe("shot-1");
    expect(resolveChatImage(messages, 2).ok).toBe(true);
  });

  it("rejects a missing index and reports how many images exist", () => {
    const messages = [userWithImages([PNG])];
    const result = resolveChatImage(messages, 3);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("index 1–1");
    expect(result.available).toEqual([
      { index: 1, mediaType: "image/png", alt: "shot-1" },
    ]);
  });

  it("explains when the latest turn has no images", () => {
    const messages: UIMessage[] = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
    ];
    const result = resolveChatImage(messages, 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("no attached images");
  });
});
