import { describe, expect, it } from "vitest";
import {
  classifyChatUserIntent,
  intentToolAvailabilityRule,
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

  it("classifies polite write requests as write, not questions", () => {
    for (const text of [
      "can you paste this into the equipment table?",
      "could you put those rows in the report?",
      "can you just place it in the section for me?",
      "please go ahead and paste the table",
      "would you kindly append that to the narrative?",
    ]) {
      expect(classifyChatUserIntent({ userText: text }).kind).toBe("write");
    }
  });

  it("still reads polite lookups that only sound like requests", () => {
    for (const text of [
      "can you tell me what is in the equipment table?",
      "could you summarize the protocol?",
      "please explain why this criterion is red",
    ]) {
      expect(classifyChatUserIntent({ userText: text }).kind).toBe("read");
    }
  });

  it("resolves ambiguous text by mode — Agent writes, Ask reads", () => {
    for (const userText of [
      "the equipment table needs the three UUTs from page 4",
      "Solea system, serial 12345, calibrated 2026-01-02",
      "same thing for the second fixture",
    ]) {
      expect(classifyChatUserIntent({ userText, mode: "agent" })).toEqual({
        kind: "write",
        reason: "ambiguous_agent_mode",
      });
      expect(classifyChatUserIntent({ userText, mode: "plan" }).kind).toBe("read");
    }
  });

  it("defaults to Agent mode when the caller does not pass one", () => {
    expect(
      classifyChatUserIntent({ userText: "three more rows like that one" }).kind
    ).toBe("write");
  });

  it("does not let Agent mode turn questions or greetings into writes", () => {
    expect(
      classifyChatUserIntent({
        userText: "what is in the equipment table?",
        mode: "agent",
      }).kind
    ).toBe("read");
    expect(classifyChatUserIntent({ userText: "hi", mode: "agent" }).kind).toBe(
      "social"
    );
    expect(
      classifyChatUserIntent({
        userText: "how should I write Purpose?",
        mode: "agent",
      }).kind
    ).toBe("read");
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

  it("treats skipped Analytics page questions and find-it as write", () => {
    expect(
      classifyChatUserIntent({
        userText:
          "Answers to your questions:\n1. Which page is M3-SYS-FN-037 on?\n   (skipped — use a placeholder)",
        surface: "analytics",
        mode: "agent",
      })
    ).toEqual({ kind: "write", reason: "skip_page_and_search" });
    expect(
      classifyChatUserIntent({
        userText: "I want you to find it",
        surface: "analytics",
        mode: "agent",
      })
    ).toEqual({ kind: "write", reason: "locate_request" });
    expect(
      classifyChatUserIntent({
        userText: "find it",
        surface: "analytics",
        mode: "agent",
      }).kind
    ).toBe("write");
    expect(
      classifyChatUserIntent({
        userText: "where is M3-SYS-FN-037 in the PDF?",
        surface: "analytics",
        mode: "agent",
      })
    ).toEqual({ kind: "read", reason: "question_or_lookup" });
  });

  it("keeps the instruction that follows a yes", () => {
    // Langfuse: "yes put it in the data worksheet" scored read, so write_column
    // was stripped and the model printed a markdown table instead.
    expect(
      classifyChatUserIntent({
        userText: "yes put it in the data worksheet",
        surface: "analytics",
        recentAssistantTexts: [
          "Would you like me to extract and populate these values into the worksheet?",
        ],
      })
    ).toEqual({ kind: "write", reason: "confirm_write_offer" });

    expect(
      classifyChatUserIntent({
        userText: "yes put it in the data worksheet",
        surface: "analytics",
      }).kind
    ).toBe("write");

    expect(
      classifyChatUserIntent({
        userText: "ok, add a Batch column",
        surface: "analytics",
      }).kind
    ).toBe("write");
  });

  it("treats a worksheet destination as write even without a known verb", () => {
    for (const text of [
      "put those numbers in the worksheet",
      "stick the torque readings into the data sheet",
      "drop them into column c3",
    ]) {
      expect(
        classifyChatUserIntent({ userText: text, surface: "analytics" }).kind
      ).toBe("write");
    }
  });

  it("still reads a question about the worksheet", () => {
    for (const text of [
      "what is in the worksheet?",
      "is there anything in the data sheet",
      "show me the columns in the worksheet",
    ]) {
      expect(
        classifyChatUserIntent({ userText: text, surface: "analytics" }).kind
      ).toBe("read");
    }
  });

  it("does not turn a bare yes into a write on the document surface", () => {
    expect(
      classifyChatUserIntent({ userText: "yes", surface: "document" }).kind
    ).toBe("social");
    expect(
      classifyChatUserIntent({
        userText: "sure, what does the protocol say?",
        surface: "document",
      }).kind
    ).toBe("read");
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

describe("intentToolAvailabilityRule", () => {
  it("says nothing on a write turn — every tool is loaded", () => {
    expect(intentToolAvailabilityRule("write", "analytics")).toBeNull();
    expect(intentToolAvailabilityRule("write", "document")).toBeNull();
  });

  it("names the stripped analytics tools on a read turn", () => {
    const rule = intentToolAvailabilityRule("read", "analytics");
    expect(rule).toContain("write_column");
    expect(rule).toContain("manage_worksheet");
    expect(rule).toContain("plot_xy_scatter");
    expect(rule).not.toContain("propose_edit");
  });

  it("names the stripped document tools on a read turn", () => {
    const rule = intentToolAvailabilityRule("read", "document");
    expect(rule).toContain("propose_edit");
    expect(rule).toContain("draft_field");
    expect(rule).not.toContain("write_column");
  });

  it("tells a social turn that no tools are loaded", () => {
    expect(intentToolAvailabilityRule("social", "document")).toContain("None");
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
