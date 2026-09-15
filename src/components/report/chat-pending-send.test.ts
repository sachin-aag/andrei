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
  it("matches the live useChat row by id immediately", () => {
    const pending = userMessage("pending-1", "hello");
    expect(
      pendingChatUserMessageIsRepresented(
        [userMessage("pending-1", "hello")],
        pending
      )
    ).toBe(true);
  });

  it("does not treat a prior same-text user turn as this send until the request starts", () => {
    const pending = userMessage("pending-1", "hello");
    expect(
      pendingChatUserMessageIsRepresented(
        [userMessage("live-1", "hello")],
        pending
      )
    ).toBe(false);
    expect(
      pendingChatUserMessageIsRepresented(
        [userMessage("live-1", "hello")],
        pending,
        { allowTextMatch: true }
      )
    ).toBe(true);
    expect(
      pendingChatUserMessageIsRepresented(
        [userMessage("live-1", "hello there")],
        pending,
        { allowTextMatch: true }
      )
    ).toBe(false);
  });

  it("does not match an earlier user turn of the same text before the request starts", () => {
    const pending = userMessage("pending-2", "hello", [image]);
    expect(
      pendingChatUserMessageIsRepresented(
        [userMessage("old", "hello", [image])],
        pending
      )
    ).toBe(false);
    expect(
      pendingChatUserMessageIsRepresented(
        [userMessage("old", "hello", [image])],
        pending,
        { allowTextMatch: true }
      )
    ).toBe(true);
    expect(
      pendingChatUserMessageIsRepresented(
        [userMessage("old", "hello")],
        pending,
        { allowTextMatch: true }
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
        [...existing, userMessage("pending-1", "hello")],
        pending
      )
    ).toEqual([...existing, userMessage("pending-1", "hello")]);
  });

  it("keeps a second send of the same wording visible until the live row uses the pending id", () => {
    const existing = [userMessage("old", "hello")];
    const pending = userMessage("pending-2", "hello");
    expect(mergePendingChatUserMessage(existing, pending)).toEqual([
      existing[0],
      pending,
    ]);
    expect(
      mergePendingChatUserMessage(existing, pending, { allowTextMatch: true })
    ).toEqual(existing);
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
