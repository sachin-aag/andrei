import { describe, expect, it } from "vitest";
import {
  classifyChatUserIntent,
  messageHasChatImage,
  recentAssistantMessageTexts,
  restrictToolsForIntent,
} from "./user-intent";

describe("classifyChatUserIntent", () => {
  it("treats greetings as social — not a draft request", () => {
    for (const text of ["hi", "Hi!", "hello", "hey there", "good morning"]) {
      expect(classifyChatUserIntent({ userText: text })).toEqual({
        kind: "social",
        reason: "greeting",
      });
    }
  });

  it("treats thanks and empty messages as social", () => {
    expect(classifyChatUserIntent({ userText: "thanks" }).kind).toBe("social");
    expect(classifyChatUserIntent({ userText: "" })).toEqual({
      kind: "social",
      reason: "empty",
    });
  });

  it("does not draft on a yes unless the assistant offered to write", () => {
    expect(classifyChatUserIntent({ userText: "yes" })).toEqual({
      kind: "social",
      reason: "ack_without_task",
    });
    expect(
      classifyChatUserIntent({
        userText: "yes please",
        recentAssistantTexts: [
          "I can draft Purpose from the protocol if you want.",
        ],
      })
    ).toEqual({ kind: "write", reason: "confirm_write_offer" });
    expect(
      classifyChatUserIntent({
        userText: "yes",
        recentAssistantTexts: ["I drafted Purpose from the protocol."],
      }).kind
    ).toBe("social");
  });

  it("matches explicit produce and start-the-report phrasing", () => {
    expect(classifyChatUserIntent({ userText: "draft Purpose" }).kind).toBe(
      "write"
    );
    expect(
      classifyChatUserIntent({ userText: "can you draft the testers section?" })
        .kind
    ).toBe("write");
    expect(
      classifyChatUserIntent({ userText: "help me start this report" }).kind
    ).toBe("write");
    expect(
      classifyChatUserIntent({ userText: "fill in executed protocol" }).kind
    ).toBe("write");
    expect(classifyChatUserIntent({ userText: "draft Purpose?" }).kind).toBe(
      "write"
    );
  });

  it("keeps writing-advice questions on the read path", () => {
    expect(
      classifyChatUserIntent({
        userText: "what should I write in Purpose?",
      }).kind
    ).toBe("read");
    expect(
      classifyChatUserIntent({
        userText: "how should I draft the results table?",
      }).kind
    ).toBe("read");
  });

  it("treats lookups and evidence questions as read, not write", () => {
    expect(
      classifyChatUserIntent({ userText: "what does this file say" }).kind
    ).toBe("read");
    expect(
      classifyChatUserIntent({
        userText: "who are the testers in the protocol?",
      }).kind
    ).toBe("read");
    expect(
      classifyChatUserIntent({
        userText: "what's the plot titled?",
        surface: "analytics",
      }).kind
    ).toBe("read");
  });

  it("treats analytics plot/extract asks as write", () => {
    expect(
      classifyChatUserIntent({
        userText: "plot assay vs index",
        surface: "analytics",
      }).kind
    ).toBe("write");
    expect(
      classifyChatUserIntent({
        userText: "extract conductivity into the worksheet",
        surface: "analytics",
      }).kind
    ).toBe("write");
  });

  it("continues a prior drafting task on keep-going", () => {
    expect(
      classifyChatUserIntent({ userText: "keep going — you missed SST" }).kind
    ).toBe("write");
  });

  it("looks at a chat image even when the caption is hi", () => {
    expect(
      classifyChatUserIntent({ userText: "hi", hasChatImages: true })
    ).toEqual({ kind: "read", reason: "chat_image" });
  });
});

describe("restrictToolsForIntent", () => {
  const documentTools = {
    read_section: {},
    search_documents: {},
    draft_field: {},
    propose_edit: {},
    ask_user: {},
  };

  it("strips every tool on a greeting so the model cannot search or draft", () => {
    expect(
      Object.keys(
        restrictToolsForIntent(documentTools, "social", "document")
      )
    ).toEqual([]);
  });

  it("keeps read tools and drops write tools on a question", () => {
    expect(
      Object.keys(restrictToolsForIntent(documentTools, "read", "document"))
    ).toEqual(["read_section", "search_documents", "ask_user"]);
  });

  it("leaves write tools on an explicit draft request", () => {
    expect(
      restrictToolsForIntent(documentTools, "write", "document")
    ).toBe(documentTools);
  });

  it("drops Analytics plot/write tools on a read turn", () => {
    const analyticsTools = {
      search_documents: {},
      write_column: {},
      plot_xy_scatter: {},
      read_worksheet: {},
    };
    expect(
      Object.keys(restrictToolsForIntent(analyticsTools, "read", "analytics"))
    ).toEqual(["search_documents", "read_worksheet"]);
  });
});

describe("recentAssistantMessageTexts", () => {
  it("walks backward from the newest assistant turn", () => {
    expect(
      recentAssistantMessageTexts([
        { role: "user", parts: [{ type: "text", text: "hi" }] },
        {
          role: "assistant",
          parts: [{ type: "text", text: "I can draft Purpose if you want." }],
        },
        { role: "user", parts: [{ type: "text", text: "yes" }] },
      ])
    ).toEqual(["I can draft Purpose if you want."]);
  });
});

describe("messageHasChatImage", () => {
  it("detects file and image parts", () => {
    expect(messageHasChatImage([{ type: "text", text: "hi" }])).toBe(false);
    expect(messageHasChatImage([{ type: "file", url: "blob:1" }])).toBe(true);
    expect(messageHasChatImage([{ type: "image" }])).toBe(true);
  });
});
