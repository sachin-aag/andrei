import { describe, expect, it } from "vitest";
import { detectCourseCorrection } from "./course-correction";

describe("detectCourseCorrection", () => {
  it("detects undo/revert patterns as course correction", () => {
    const cases = [
      "undo that",
      "revert that change",
      "go back to the previous version",
      "roll back",
      "take that back",
      "cancel that",
      "never mind",
      "nevermind",
    ];
    for (const text of cases) {
      const result = detectCourseCorrection({
        userText: text,
        hasPriorAssistantOutput: true,
      });
      expect(result.detected).toBe(true);
      expect(result.reason).toBe("undo_revert");
      expect(result.confidence).toBe("high");
    }
  });

  it("detects explicit wrong/incorrect feedback as course correction", () => {
    const cases = [
      "that's wrong",
      "that's incorrect",
      "no, I said to use the other table",
      "no that's not what I asked for",
      "you got it wrong",
      "you misunderstood",
      "wrong",
      "incorrect",
    ];
    for (const text of cases) {
      const result = detectCourseCorrection({
        userText: text,
        hasPriorAssistantOutput: true,
      });
      expect(result.detected).toBe(true);
      expect(result.reason).toBe("explicit_wrong");
    }
  });

  it("detects rewrite request patterns as course correction", () => {
    const cases = [
      "rewrite that section",
      "redo the introduction",
      "do it again but differently",
      "try again",
      "start over",
      "from scratch",
      "not like that",
    ];
    for (const text of cases) {
      const result = detectCourseCorrection({
        userText: text,
        hasPriorAssistantOutput: true,
      });
      expect(result.detected).toBe(true);
      expect(result.reason).toBe("rewrite_request");
    }
  });

  it("detects override patterns when message is long enough", () => {
    const result = detectCourseCorrection({
      userText: "actually, I want you to use the other format instead of what you did",
      hasPriorAssistantOutput: true,
    });
    expect(result.detected).toBe(true);
    expect(result.reason).toBe("override_pattern");
    expect(result.confidence).toBe("medium");
  });

  it("does not fire on short override words without context", () => {
    const result = detectCourseCorrection({
      userText: "actually",
      hasPriorAssistantOutput: true,
    });
    expect(result.detected).toBe(false);
  });

  it("detects rejection patterns as course correction", () => {
    const cases = [
      "don't use that format",
      "remove that paragraph",
      "delete this section",
      "get rid of the extra columns",
      "leave out the summary",
      "skip this part",
      "I don't want that",
    ];
    for (const text of cases) {
      const result = detectCourseCorrection({
        userText: text,
        hasPriorAssistantOutput: true,
      });
      expect(result.detected).toBe(true);
      expect(result.reason).toBe("reject_output");
    }
  });

  it("does not fire without prior assistant output", () => {
    const result = detectCourseCorrection({
      userText: "undo that",
      hasPriorAssistantOutput: false,
    });
    expect(result.detected).toBe(false);
    expect(result.reason).toBe("no_prior_output");
  });

  it("does not fire on empty messages", () => {
    const result = detectCourseCorrection({
      userText: "",
      hasPriorAssistantOutput: true,
    });
    expect(result.detected).toBe(false);
    expect(result.reason).toBe("empty_message");
  });

  it("does not fire on normal follow-ups", () => {
    const normalMessages = [
      "can you also add a table?",
      "looks good, now draft the next section",
      "what about the control section?",
      "thanks, continue with measure",
      "that's great",
      "perfect",
    ];
    for (const text of normalMessages) {
      const result = detectCourseCorrection({
        userText: text,
        hasPriorAssistantOutput: true,
      });
      expect(result.detected).toBe(false);
    }
  });

  it("does not fire on questions", () => {
    const questions = [
      "can you explain what you did?",
      "why did you use that format?",
      "what's the rationale?",
    ];
    for (const text of questions) {
      const result = detectCourseCorrection({
        userText: text,
        hasPriorAssistantOutput: true,
      });
      expect(result.detected).toBe(false);
    }
  });
});
