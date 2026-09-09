import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createScore = vi.hoisted(() => vi.fn());
const flush = vi.hoisted(() => vi.fn(async () => {}));
const isLangfuseEnabled = vi.hoisted(() => vi.fn(() => true));
const getActiveTraceId = vi.hoisted(() => vi.fn((): string | undefined => undefined));

vi.mock("@langfuse/client", () => ({
  LangfuseClient: class {
    score = { create: createScore };
    flush = flush;
  },
}));

vi.mock("./langfuse", () => ({
  isLangfuseEnabled,
  getActiveTraceId,
  clipLangfuseAttribute: (value: string) =>
    value.length <= 200 ? value : value.slice(0, 200),
}));

import {
  flushLangfuseScores,
  recordSuggestionDecisionScore,
  recordUserCourseCorrectScore,
  recordUserEditedAfterScore,
} from "./langfuse-scores";

describe("Langfuse suggestion quality scores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isLangfuseEnabled.mockReturnValue(true);
    getActiveTraceId.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not create scores when Langfuse is disabled", async () => {
    isLangfuseEnabled.mockReturnValue(false);
    await recordSuggestionDecisionScore({
      reportId: "rpt-1",
      decision: "accepted",
      suggestionId: "sug-1",
    });
    expect(createScore).not.toHaveBeenCalled();
  });

  it("records suggestion_decision as a session categorical score", async () => {
    await recordSuggestionDecisionScore({
      reportId: "rpt-1",
      decision: "accepted",
      suggestionId: "sug-1",
      section: "define",
      contentPath: "narrative",
      reason: "ai_fix accepted by Engineer",
    });
    expect(createScore).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "suggestion-decision-sug-1",
        sessionId: "rpt-1",
        name: "suggestion_decision",
        value: "accepted",
        dataType: "CATEGORICAL",
      })
    );
    expect(flush).toHaveBeenCalled();
  });

  it("records dismissed suggestions with the same score name", async () => {
    await recordSuggestionDecisionScore({
      reportId: "rpt-1",
      decision: "dismissed",
      suggestionId: "sug-2",
    });
    expect(createScore).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "suggestion-decision-sug-2",
        value: "dismissed",
        name: "suggestion_decision",
      })
    );
  });

  it("attaches user_course_corrected to the captured chat trace", async () => {
    await recordUserCourseCorrectScore({
      traceId: "trace-abc",
      sessionId: "chat-1",
      reportId: "rpt-1",
      reason: "undo_revert",
      userText: "undo that",
    });
    expect(createScore).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: "trace-abc",
        sessionId: "chat-1",
        name: "user_course_corrected",
        value: 1,
        dataType: "BOOLEAN",
      })
    );
  });

  it("falls back to a session score when no chat trace is active", async () => {
    await recordUserCourseCorrectScore({
      sessionId: "chat-1",
      reportId: "rpt-1",
      reason: "explicit_wrong",
    });
    expect(createScore).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "chat-1",
        name: "user_course_corrected",
        value: 1,
      })
    );
    expect(createScore.mock.calls[0]?.[0]).not.toHaveProperty("traceId");
  });

  it("skips user_edited_after when the section was not LLM-authored", async () => {
    await recordUserEditedAfterScore({
      reportId: "rpt-1",
      sectionId: "define",
      wasLlmGenerated: false,
    });
    expect(createScore).not.toHaveBeenCalled();
  });

  it("records user_edited_after on the report session without a trace", async () => {
    const authoredAt = new Date("2026-09-09T12:00:00.000Z");
    await recordUserEditedAfterScore({
      reportId: "rpt-1",
      sectionId: "define",
      wasLlmGenerated: true,
      llmAuthoredAt: authoredAt,
    });
    expect(createScore).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `user-edited-after-rpt-1-define-${authoredAt.getTime()}`,
        sessionId: "rpt-1",
        name: "user_edited_after",
        value: 1,
        dataType: "BOOLEAN",
      })
    );
    expect(createScore.mock.calls[0]?.[0]).not.toHaveProperty("traceId");
  });

  it("flushLangfuseScores is a no-op when disabled", async () => {
    isLangfuseEnabled.mockReturnValue(false);
    await flushLangfuseScores();
    expect(flush).not.toHaveBeenCalled();
  });
});
