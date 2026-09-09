import { describe, expect, it } from "vitest";
import { detectCourseCorrection } from "./course-correction";

describe("detectCourseCorrection", () => {
  it("treats undo/revert as high-confidence course correction", () => {
    for (const text of [
      "undo that",
      "revert that change",
      "go back to the previous version",
      "roll back",
      "take that back",
      "cancel that",
      "never mind",
      "nevermind",
    ]) {
      expect(
        detectCourseCorrection({
          userText: text,
          hasPriorAssistantOutput: true,
        })
      ).toEqual({
        detected: true,
        reason: "undo_revert",
        confidence: "high",
      });
    }
  });

  it("treats explicit wrong/incorrect feedback as high-confidence correction", () => {
    for (const text of [
      "that's wrong",
      "that's incorrect",
      "no, I said to use the other table",
      "no that's not what I asked for",
      "you got it wrong",
      "you misunderstood",
      "wrong",
      "incorrect",
    ]) {
      expect(
        detectCourseCorrection({
          userText: text,
          hasPriorAssistantOutput: true,
        })
      ).toEqual({
        detected: true,
        reason: "explicit_wrong",
        confidence: "high",
      });
    }
  });

  it("treats rewrite requests as high-confidence correction", () => {
    for (const text of [
      "rewrite that section",
      "redo the introduction",
      "do it again but differently",
      "try again",
      "start over",
      "from scratch",
      "not like that",
    ]) {
      expect(
        detectCourseCorrection({
          userText: text,
          hasPriorAssistantOutput: true,
        })
      ).toEqual({
        detected: true,
        reason: "rewrite_request",
        confidence: "high",
      });
    }
  });

  it("fires override only when the message is long enough to carry a new instruction", () => {
    expect(
      detectCourseCorrection({
        userText:
          "actually, I want you to use the other format instead of what you did",
        hasPriorAssistantOutput: true,
      })
    ).toEqual({
      detected: true,
      reason: "override_pattern",
      confidence: "medium",
    });
    expect(
      detectCourseCorrection({
        userText: "actually",
        hasPriorAssistantOutput: true,
      }).detected
    ).toBe(false);
  });

  it("treats rejection phrasing as medium-confidence correction", () => {
    for (const text of [
      "don't use that format",
      "remove that paragraph",
      "delete this section",
      "get rid of the extra columns",
      "leave out the summary",
      "skip this part",
      "I don't want that",
    ]) {
      expect(
        detectCourseCorrection({
          userText: text,
          hasPriorAssistantOutput: true,
        })
      ).toEqual({
        detected: true,
        reason: "reject_output",
        confidence: "medium",
      });
    }
  });

  it("does not fire without prior assistant output", () => {
    expect(
      detectCourseCorrection({
        userText: "undo that",
        hasPriorAssistantOutput: false,
      })
    ).toEqual({
      detected: false,
      reason: "no_prior_output",
      confidence: "medium",
    });
  });

  it("does not fire on empty messages", () => {
    expect(
      detectCourseCorrection({
        userText: "",
        hasPriorAssistantOutput: true,
      })
    ).toEqual({
      detected: false,
      reason: "empty_message",
      confidence: "medium",
    });
  });

  it("does not fire on normal follow-ups", () => {
    for (const text of [
      "can you also add a table?",
      "looks good, now draft the next section",
      "what about the control section?",
      "thanks, continue with measure",
      "that's great",
      "perfect",
    ]) {
      expect(
        detectCourseCorrection({
          userText: text,
          hasPriorAssistantOutput: true,
        }).detected
      ).toBe(false);
    }
  });

  it("does not fire on questions", () => {
    for (const text of [
      "can you explain what you did?",
      "why did you use that format?",
      "what's the rationale?",
    ]) {
      expect(
        detectCourseCorrection({
          userText: text,
          hasPriorAssistantOutput: true,
        }).detected
      ).toBe(false);
    }
  });
});
