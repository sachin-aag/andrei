import { describe, expect, it } from "vitest";
import type { FileUIPart, UIMessage } from "ai";
import {
  buildPendingChatUserMessage,
  mergePendingChatUserMessage,
  pendingChatUserMessageIsRepresented,
} from "./chat-pending-send";

const image: FileUIPart = {
  type: "file",
  mediaType: "image/png",
  filename: "shot.png",
  url: "data:image/png;base64,abc",
};

function userMessage(
  id: string,
  text: string,
  files: FileUIPart[] = []
): UIMessage {
  return buildPendingChatUserMessage({ id, text, files });
}

describe("buildPendingChatUserMessage", () => {
  it("builds a user turn from text and image parts", () => {
    const message = buildPendingChatUserMessage({
      id: "pending-1",
      text: "  plot this  ",
      files: [image],
      metadata: { chatTarget: "analytics" },
    });
    expect(message).toEqual({
      id: "pending-1",
      role: "user",
      parts: [{ type: "text", text: "plot this" }, image],
      metadata: { chatTarget: "analytics" },
    });
  });

  it("omits empty text so an image-only send still has parts", () => {
    const message = buildPendingChatUserMessage({
      id: "pending-img",
      text: "   ",
      files: [image],
    });
    expect(message.parts).toEqual([image]);
  });
});

describe("pendingChatUserMessageIsRepresented", () => {
  it("matches the live useChat row by id or by text and images", () => {
    const pending = userMessage("pending-1", "hello");
    expect(
      pendingChatUserMessageIsRepresented(
        [userMessage("pending-1", "hello")],
        pending
      )
    ).toBe(true);
    expect(
      pendingChatUserMessageIsRepresented(
        [userMessage("live-1", "hello")],
        pending
      )
    ).toBe(true);
    expect(
      pendingChatUserMessageIsRepresented(
        [userMessage("live-1", "hello there")],
        pending
      )
    ).toBe(false);
    expect(
      pendingChatUserMessageIsRepresented(
        [userMessage("a1", "hi"), userMessage("a2", "hello")],
        pending
      )
    ).toBe(true);
  });

  it("does not match an earlier user turn of the same text", () => {
    const pending = userMessage("pending-2", "hello", [image]);
    expect(
      pendingChatUserMessageIsRepresented(
        [userMessage("old", "hello", [image])],
        pending
      )
    ).toBe(true);
    expect(
      pendingChatUserMessageIsRepresented(
        [userMessage("old", "hello")],
        pending
      )
    ).toBe(false);
  });
});

describe("mergePendingChatUserMessage", () => {
  it("appends the optimistic user turn until useChat catches up", () => {
    const existing = [userMessage("old", "earlier")];
    const pending = userMessage("pending-1", "hello");
    expect(mergePendingChatUserMessage(existing, pending)).toEqual([
      existing[0],
      pending,
    ]);
    expect(
      mergePendingChatUserMessage(
        [...existing, userMessage("live", "hello")],
        pending
      )
    ).toEqual([...existing, userMessage("live", "hello")]);
  });

  it("leaves the thread unchanged when nothing is pending", () => {
    const existing = [userMessage("old", "earlier")];
    expect(mergePendingChatUserMessage(existing, null)).toEqual(existing);
  });

  it("shows the typed turn on an empty thread before useChat catches up", () => {
    const pending = userMessage("pending-1", "hello");
    expect(mergePendingChatUserMessage([], pending)).toEqual([pending]);
  });
});
