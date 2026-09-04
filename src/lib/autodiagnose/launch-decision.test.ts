import { describe, expect, it } from "vitest";
import { decideAutodiagnoseLaunch } from "./launch-decision";
import { buildAutodiagnoseAgentPrompt } from "./prompt";
import { fingerprintMarker } from "./fingerprint";
import type { ClassifyResult, VercelErrorEvent } from "./types";

const classification: ClassifyResult = {
  action: "investigate",
  category: "runtime",
  reason: "Vercel function crashed",
  confidence: "medium",
  fingerprint: "abc123def456",
};

describe("decideAutodiagnoseLaunch", () => {
  it("skips when the classifier says skip", () => {
    const decision = decideAutodiagnoseLaunch({
      classification: { ...classification, action: "skip", category: "not_a_bug" },
      existingOpenPrs: [],
      existingCommitComments: [],
      cursorApiKeyPresent: true,
    });
    expect(decision.action).toBe("skip");
  });

  it("skips when CURSOR_API_KEY is missing", () => {
    const decision = decideAutodiagnoseLaunch({
      classification,
      existingOpenPrs: [],
      existingCommitComments: [],
      cursorApiKeyPresent: false,
    });
    expect(decision.action).toBe("skip");
    expect(decision.reason).toMatch(/CURSOR_API_KEY/);
  });

  it("skips when an open PR already has the fingerprint", () => {
    const decision = decideAutodiagnoseLaunch({
      classification,
      existingOpenPrs: [`fix stuff ${fingerprintMarker(classification.fingerprint)}`],
      existingCommitComments: [],
      cursorApiKeyPresent: true,
    });
    expect(decision.action).toBe("skip");
    expect(decision.reason).toMatch(/open PR/);
  });

  it("skips when this commit already launched an agent", () => {
    const decision = decideAutodiagnoseLaunch({
      classification,
      existingOpenPrs: [],
      existingCommitComments: [
        `${fingerprintMarker(classification.fingerprint)} launched`,
      ],
      cursorApiKeyPresent: true,
    });
    expect(decision.action).toBe("skip");
    expect(decision.reason).toMatch(/already launched/);
  });

  it("launches when it is a new production bug", () => {
    const decision = decideAutodiagnoseLaunch({
      classification,
      existingOpenPrs: [],
      existingCommitComments: [],
      cursorApiKeyPresent: true,
    });
    expect(decision).toEqual({
      action: "launch",
      reason: "Vercel function crashed",
    });
  });
});

describe("buildAutodiagnoseAgentPrompt", () => {
  it("tells Cursor to fix the bug and open a draft PR", () => {
    const event: VercelErrorEvent = {
      source: "deployment_status",
      environment: "Production",
      projectName: "andrei-v2",
      deploymentUrl: null,
      logUrl: "https://vercel.com/logs",
      sha: "deadbeef",
      ref: "main",
      text: "FUNCTION_INVOCATION_FAILED",
    };
    const prompt = buildAutodiagnoseAgentPrompt({
      event,
      classification,
      repository: "https://github.com/sachin-aag/andrei",
    });
    expect(prompt).toContain("draft");
    expect(prompt).toContain("PostHog");
    expect(prompt).toContain("Langfuse");
    expect(prompt).toContain("Neon");
    expect(prompt).toContain("abc123def456");
    expect(prompt).not.toContain("Do not merge. Do not merge");
  });

  it("tells the agent that caught chat stream errors are in-scope", () => {
    const event: VercelErrorEvent = {
      source: "runtime",
      environment: "production",
      projectName: "andrei-v2",
      deploymentUrl: null,
      logUrl: null,
      sha: null,
      ref: "main",
      text: "chat: assistant stream error AI_InvalidToolInputError",
    };
    const prompt = buildAutodiagnoseAgentPrompt({
      event,
      classification: {
        action: "investigate",
        category: "ai",
        reason: "Chat tool input failed schema validation and killed the assistant stream",
        confidence: "high",
        fingerprint: "feedfacecafe",
      },
      repository: "https://github.com/sachin-aag/andrei",
    });
    expect(prompt).toContain("Caught chat stream errors are in-scope");
    expect(prompt).toContain("AI_InvalidToolInputError");
  });
});
