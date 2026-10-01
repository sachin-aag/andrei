import { describe, expect, it } from "vitest";
import type { FileUIPart, UIMessage } from "ai";
import { CHAT_AUTO_CONTINUE_TEXT } from "@/lib/ai/chat/pending-plan";
import {
  buildPendingChatUserMessage,
  mergePendingChatUserMessage,
  pendingChatSendBelongsToSession,
  pendingChatUserMessageIsRepresented,
  shouldShowPendingChatUserOverlay,
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

function assistantMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
  };
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

  it("matches the live user row by id after the assistant reply arrives", () => {
    const pending = userMessage("pending-1", "hello");
    expect(
      pendingChatUserMessageIsRepresented(
        [
          userMessage("pending-1", "hello"),
          assistantMessage("a1", "stub reply"),
        ],
        pending
      )
    ).toBe(true);
  });

  it("matches the original prompt after an auto-continue user row is appended", () => {
    const pending = userMessage("pending-1", "Draft remaining sections");
    const live = [
      userMessage("live-1", "Draft remaining sections"),
      assistantMessage("a1", "Drafted Objective."),
      {
        ...userMessage("auto-1", "Continue the remaining sections."),
        metadata: { autoContinue: true },
      },
    ];
    expect(pendingChatUserMessageIsRepresented(live, pending)).toBe(false);
    expect(
      pendingChatUserMessageIsRepresented(live, pending, {
        allowTextMatch: true,
      })
    ).toBe(true);
    expect(
      mergePendingChatUserMessage(live, pending, { allowTextMatch: true })
    ).toEqual(live);
  });

  it("matches the original prompt when hydrate dropped autoContinue metadata", () => {
    const pending = userMessage("pending-1", "draft remaining sections");
    const live = [
      userMessage("live-1", "draft remaining sections"),
      assistantMessage("a1", "Drafted Objective."),
      userMessage("auto-1", CHAT_AUTO_CONTINUE_TEXT),
      assistantMessage("a2", "Drafted Conclusion."),
    ];
    expect(
      pendingChatUserMessageIsRepresented(live, pending, {
        allowTextMatch: true,
      })
    ).toBe(true);
    expect(
      mergePendingChatUserMessage(live, pending, { allowTextMatch: true })
    ).toEqual(live);
  });

  it("matches the original prompt when a later user answer is the last turn", () => {
    const pending = userMessage("pending-1", "draft remaining sections");
    const live = [
      userMessage("live-1", "draft remaining sections"),
      assistantMessage("a1", "Which format?"),
      userMessage("answer-1", "Cartridge"),
      assistantMessage("a2", "Drafted Scope."),
    ];
    expect(
      pendingChatUserMessageIsRepresented(live, pending, {
        allowTextMatch: true,
      })
    ).toBe(true);
  });
});

describe("pendingChatSendBelongsToSession", () => {
  it("keeps an unsaved send on the blank thread and drops it on another tab", () => {
    expect(pendingChatSendBelongsToSession(null, null)).toBe(true);
    expect(pendingChatSendBelongsToSession("session-1", "session-1")).toBe(
      true
    );
    expect(pendingChatSendBelongsToSession("session-1", "session-2")).toBe(
      false
    );
    expect(pendingChatSendBelongsToSession("session-1", null)).toBe(false);
    expect(pendingChatSendBelongsToSession(null, "session-2")).toBe(false);
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

  it("does not append a second user bubble after the assistant reply lands", () => {
    const pending = userMessage("pending-1", "hello");
    const live = userMessage("pending-1", "hello");
    const assistant = assistantMessage("a1", "stub reply");
    expect(mergePendingChatUserMessage([live, assistant], pending)).toEqual([
      live,
      assistant,
    ]);
  });
});

describe("shouldShowPendingChatUserOverlay", () => {
  const pending = userMessage("pending-1", "draft remaining sections");
  const live = [
    userMessage("live-1", "draft remaining sections"),
    assistantMessage("a1", "Drafted Conclusion."),
  ];

  it("shows the optimistic bubble before the request starts", () => {
    expect(
      shouldShowPendingChatUserOverlay({
        pending,
        belongsToSession: true,
        messages: [],
        busy: false,
        pendingRequestStarted: false,
        sawStreamBusy: false,
      })
    ).toBe(true);
  });

  it("keeps the overlay until useChat becomes busy after send starts", () => {
    expect(
      shouldShowPendingChatUserOverlay({
        pending,
        belongsToSession: true,
        messages: [],
        busy: false,
        pendingRequestStarted: true,
        sawStreamBusy: false,
      })
    ).toBe(true);
  });

  it("hides Working… after this send already streamed and went idle", () => {
    expect(
      shouldShowPendingChatUserOverlay({
        pending,
        belongsToSession: true,
        messages: [
          assistantMessage("a1", "Drafted Conclusion."),
          userMessage("auto-1", CHAT_AUTO_CONTINUE_TEXT),
        ],
        busy: false,
        pendingRequestStarted: true,
        sawStreamBusy: true,
      })
    ).toBe(false);
  });

  it("hides the overlay once the original prompt is in the thread", () => {
    expect(
      shouldShowPendingChatUserOverlay({
        pending,
        belongsToSession: true,
        messages: live,
        busy: true,
        pendingRequestStarted: true,
        sawStreamBusy: true,
      })
    ).toBe(false);
  });

  it("does not overlay a send from another session", () => {
    expect(
      shouldShowPendingChatUserOverlay({
        pending,
        belongsToSession: false,
        messages: [],
        busy: true,
        pendingRequestStarted: true,
        sawStreamBusy: true,
      })
    ).toBe(false);
  });
});
