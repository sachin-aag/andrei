import { describe, expect, it } from "vitest";
import {
  chatMessageTargetFromMetadata,
  chatMessageTargetFromParts,
  chatMessageTargetLabel,
  chatUserTurnMetadata,
  isChatMessageTarget,
  tagChatMessages,
} from "./message-target";

describe("isChatMessageTarget", () => {
  it("accepts the two work-product targets", () => {
    expect(isChatMessageTarget("report")).toBe(true);
    expect(isChatMessageTarget("analytics")).toBe(true);
    expect(isChatMessageTarget("worksheet")).toBe(false);
    expect(isChatMessageTarget(undefined)).toBe(false);
  });
});

describe("chatUserTurnMetadata", () => {
  it("stamps only the route's target", () => {
    expect(chatUserTurnMetadata("analytics")).toEqual({
      chatTarget: "analytics",
    });
  });
});

describe("chatMessageTargetLabel", () => {
  it("uses the composer nouns", () => {
    expect(chatMessageTargetLabel("report")).toBe("Report");
    expect(chatMessageTargetLabel("analytics")).toBe("Analytics");
  });
});

describe("chatMessageTargetFromMetadata", () => {
  it("prefers the stamped chatTarget", () => {
    expect(
      chatMessageTargetFromMetadata({
        chatTarget: "analytics",
        promptVersion: "chat-v67-plot-confirm",
      })
    ).toBe("analytics");
  });

  it("reads legacy assistant prompt versions", () => {
    expect(
      chatMessageTargetFromMetadata({ promptVersion: "chat-v67-plot-confirm" })
    ).toBe("report");
    expect(
      chatMessageTargetFromMetadata({
        promptVersion: "analytics-chat-v26",
      })
    ).toBe("analytics");
  });

  it("ignores unknown metadata", () => {
    expect(chatMessageTargetFromMetadata({})).toBeNull();
    expect(chatMessageTargetFromMetadata(null)).toBeNull();
    expect(
      chatMessageTargetFromMetadata({ chatTarget: "worksheet" })
    ).toBeNull();
  });
});

describe("chatMessageTargetFromParts", () => {
  it("tags exclusive report tools", () => {
    expect(
      chatMessageTargetFromParts([{ type: "tool-propose_edit" }])
    ).toBe("report");
    expect(
      chatMessageTargetFromParts([{ type: "tool-read_section" }])
    ).toBe("report");
  });

  it("tags exclusive analytics tools", () => {
    expect(
      chatMessageTargetFromParts([{ type: "tool-write_column" }])
    ).toBe("analytics");
    expect(
      chatMessageTargetFromParts([{ toolName: "plot_boxplot" }])
    ).toBe("analytics");
  });

  it("does not treat shared tools as a vote", () => {
    expect(
      chatMessageTargetFromParts([{ type: "tool-search_documents" }])
    ).toBeNull();
    expect(
      chatMessageTargetFromParts([{ type: "tool-plot_measurements" }])
    ).toBeNull();
    expect(
      chatMessageTargetFromParts([{ type: "tool-ask_user" }])
    ).toBeNull();
  });

  it("stays untagged when exclusive tools from both surfaces appear", () => {
    expect(
      chatMessageTargetFromParts([
        { type: "tool-propose_edit" },
        { type: "tool-write_column" },
      ])
    ).toBeNull();
  });
});

describe("tagChatMessages", () => {
  it("keeps mixed-thread stamps on each turn", () => {
    const tagged = tagChatMessages([
      { role: "user", metadata: { chatTarget: "report" } },
      {
        role: "assistant",
        metadata: { chatTarget: "report", promptVersion: "chat-v67" },
      },
      { role: "user", metadata: { chatTarget: "analytics" } },
      {
        role: "assistant",
        metadata: { promptVersion: "analytics-chat-v26" },
      },
    ]);
    expect(tagged.map((m) => m.chatTarget)).toEqual([
      "report",
      "report",
      "analytics",
      "analytics",
    ]);
  });

  it("lets a legacy user inherit the following assistant prompt version", () => {
    const tagged = tagChatMessages([
      { role: "user", parts: [{ type: "text", text: "plot assay" }] },
      {
        role: "assistant",
        metadata: { promptVersion: "analytics-chat-v26" },
        parts: [{ type: "tool-run_capability_sixpack" }],
      },
    ]);
    expect(tagged.map((m) => m.chatTarget)).toEqual(["analytics", "analytics"]);
  });

  it("does not retag earlier unknown history from a later in-flight send", () => {
    const tagged = tagChatMessages(
      [
        { role: "user", parts: [{ type: "text", text: "old" }] },
        { role: "assistant", parts: [{ type: "text", text: "old reply" }] },
        { role: "user", parts: [{ type: "text", text: "new" }] },
        { role: "assistant", parts: [{ type: "text", text: "…" }] },
      ],
      { inFlightTarget: "report" }
    );
    expect(tagged.map((m) => m.chatTarget)).toEqual([
      null,
      null,
      "report",
      "report",
    ]);
  });

  it("applies inFlightTarget only to the current untagged turn", () => {
    const tagged = tagChatMessages(
      [
        { role: "user", metadata: { chatTarget: "analytics" } },
        {
          role: "assistant",
          metadata: { chatTarget: "analytics" },
        },
        { role: "user", metadata: { chatTarget: "report" } },
        { role: "assistant", parts: [{ type: "text", text: "streaming" }] },
      ],
      { inFlightTarget: "report" }
    );
    expect(tagged.map((m) => m.chatTarget)).toEqual([
      "analytics",
      "analytics",
      "report",
      "report",
    ]);
  });

  it("fills a gap from the previous tagged turn", () => {
    const tagged = tagChatMessages([
      { role: "user", metadata: { chatTarget: "report" } },
      { role: "assistant", parts: [{ type: "text", text: "ok" }] },
    ]);
    expect(tagged.map((m) => m.chatTarget)).toEqual(["report", "report"]);
  });

  it("leaves a fully unknown legacy thread untagged", () => {
    const tagged = tagChatMessages([
      { role: "user", parts: [{ type: "text", text: "hello" }] },
      { role: "assistant", parts: [{ type: "text", text: "hi" }] },
    ]);
    expect(tagged.map((m) => m.chatTarget)).toEqual([null, null]);
  });
});
