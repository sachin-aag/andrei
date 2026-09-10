import { describe, expect, it } from "vitest";
import {
  analyticsChatApi,
  chatFailureSurfaceFromSend,
  parseChatTargetFromBody,
  readJsonBody,
  reportChatApi,
  resolveChatTurnUrl,
} from "./chat-turn-url";

describe("resolveChatTurnUrl", () => {
  it("sends analytics-targeted turns to the stats assistant", () => {
    const report = reportChatApi("rep-1");
    expect(
      resolveChatTurnUrl("rep-1", report, { chatTarget: "analytics" })
    ).toBe(analyticsChatApi("rep-1"));
    expect(resolveChatTurnUrl("rep-1", report, { chatTarget: "report" })).toBe(
      report
    );
    expect(resolveChatTurnUrl("rep-1", report, {})).toBe(report);
  });

  it("reads a JSON POST body without throwing on garbage", () => {
    expect(parseChatTargetFromBody({ chatTarget: "analytics" })).toBe(
      "analytics"
    );
    expect(readJsonBody({ body: "{not json" })).toBeNull();
    expect(readJsonBody({ body: '{"chatTarget":"report"}' })).toEqual({
      chatTarget: "report",
    });
  });
});

describe("chatFailureSurfaceFromSend", () => {
  it("prefers the POST body chatTarget over message metadata", () => {
    expect(
      chatFailureSurfaceFromSend({
        body: { chatTarget: "analytics" },
        metadata: { chatTarget: "report" },
      })
    ).toBe("analytics");
  });

  it("falls back to user-message metadata, then report", () => {
    expect(
      chatFailureSurfaceFromSend({ metadata: { chatTarget: "analytics" } })
    ).toBe("analytics");
    expect(chatFailureSurfaceFromSend({})).toBe("report");
    expect(
      chatFailureSurfaceFromSend({ body: { chatTarget: "worksheet" } })
    ).toBe("report");
  });
});
