import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import type { LanguageModel } from "ai";
import { isTestStubChat } from "@/lib/test/ai-bypass";
import { recordAiUsage } from "@/lib/ai/usage";
import {
  INTENT_CLASSIFIER_PROMPT_VERSION,
  documentIntentFocus,
  resolveChatUserIntent,
} from "./resolve-user-intent";
import { classifyChatUserIntent } from "./user-intent";

const generateTextMock = vi.mocked(generateText);

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

vi.mock("@/lib/ai/chat/model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/chat/model")>();
  return {
    ...actual,
    resolveChatExtractLanguageModel: vi.fn(
      () => ({ modelId: "gemini-3.5-flash-lite" }) as LanguageModel
    ),
  };
});

vi.mock("@/lib/ai/usage", () => ({
  assertAiBudgetAvailable: vi.fn().mockResolvedValue(undefined),
  recordAiUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/test/ai-bypass", () => ({
  isTestStubChat: vi.fn(() => false),
}));

function mockIntent(
  kind: "social" | "read" | "write",
  confidence = 0.9,
  preferredSurface?: "report" | "analytics"
) {
  generateTextMock.mockResolvedValueOnce({
    output: { kind, confidence, preferredSurface },
    usage: { inputTokens: 40, outputTokens: 8 },
  } as never);
}

describe("resolveChatUserIntent", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    vi.mocked(isTestStubChat).mockReturnValue(false);
    vi.mocked(recordAiUsage).mockClear();
  });

  it("skips Flash-Lite for greetings and explicit produce verbs", async () => {
    await expect(
      resolveChatUserIntent({ userText: "hi", mode: "agent" })
    ).resolves.toEqual({ kind: "social", reason: "greeting" });
    await expect(
      resolveChatUserIntent({ userText: "draft Purpose", mode: "agent" })
    ).resolves.toEqual({ kind: "write", reason: "produce_request" });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("skips Flash-Lite when stub chat is on", async () => {
    vi.mocked(isTestStubChat).mockReturnValue(true);
    await expect(
      resolveChatUserIntent({
        userText: "plan the first 3 sections",
        mode: "agent",
      })
    ).resolves.toEqual({ kind: "write", reason: "ambiguous_agent_mode" });
    await expect(
      resolveChatUserIntent({
        userText: "fill the worksheet",
        mode: "agent",
        surface: "document",
      })
    ).resolves.toEqual({ kind: "write", reason: "produce_request" });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("classifies Agent-mode plan/outline mush as read", async () => {
    mockIntent("read");
    await expect(
      resolveChatUserIntent({
        userText: "plan the first 3 sections",
        mode: "agent",
        workspaceChrome: "agent",
      })
    ).resolves.toEqual({ kind: "read", reason: "llm_read" });
    expect(generateTextMock).toHaveBeenCalledOnce();
    const prompt = String(
      (generateTextMock.mock.calls[0]?.[0] as { prompt?: string }).prompt ?? ""
    );
    expect(prompt).toContain("plan the first 3 sections");
    expect(prompt).toContain("chrome: agent");
    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "document_chat",
        metadata: expect.objectContaining({
          classifier: "intent",
          promptVersion: INTENT_CLASSIFIER_PROMPT_VERSION,
        }),
      })
    );
  });

  it("keeps a pasted Agent-mode row as write when Lite says write", async () => {
    mockIntent("write");
    await expect(
      resolveChatUserIntent({
        userText: "the equipment table needs the three UUTs from page 4",
        mode: "agent",
      })
    ).resolves.toEqual({ kind: "write", reason: "llm_write" });
  });

  it("falls back to the rules decision when Lite fails", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("timeout"));
    await expect(
      resolveChatUserIntent({
        userText: "plan the first 3 sections",
        mode: "agent",
      })
    ).resolves.toEqual({ kind: "write", reason: "ambiguous_agent_mode" });
    generateTextMock.mockRejectedValueOnce(new Error("timeout"));
    await expect(
      resolveChatUserIntent({
        userText: "fill the worksheet",
        mode: "agent",
        surface: "document",
      })
    ).resolves.toEqual({ kind: "write", reason: "produce_request" });
  });

  it("falls back when Lite confidence is too low", async () => {
    mockIntent("read", 0.2);
    await expect(
      resolveChatUserIntent({
        userText: "plan the first 3 sections",
        mode: "agent",
      })
    ).resolves.toEqual({ kind: "write", reason: "ambiguous_agent_mode" });
  });

  it("runs Lite for a Document worksheet dump and offers Analytics at high confidence", async () => {
    mockIntent("write", 0.92, "analytics");
    await expect(
      resolveChatUserIntent({
        userText: "extract conductivity into the worksheet",
        mode: "agent",
        surface: "document",
      })
    ).resolves.toEqual({
      kind: "read",
      reason: "llm_analytics_surface",
      switchToAnalytics: true,
    });
    expect(generateTextMock).toHaveBeenCalledOnce();
    const prompt = String(
      (generateTextMock.mock.calls[0]?.[0] as { prompt?: string }).prompt ?? ""
    );
    expect(prompt).toContain("preferredSurface=analytics");
    expect(prompt).toContain("extract conductivity into the worksheet");
    expect(prompt).toContain("yes / go for it / do it after you told them to switch");
  });

  it("does not call Lite for go-for-it after a Switch to Analytics reply", async () => {
    await expect(
      resolveChatUserIntent({
        userText: "go for it",
        mode: "agent",
        surface: "analytics",
        recentAssistantTexts: [
          "You can use the Switch to Analytics button on the Report | Analytics selector.",
        ],
      })
    ).resolves.toEqual({
      kind: "write",
      reason: "confirm_analytics_switch",
    });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("runs the same Lite call for Ask-mode worksheet dumps that rules would skip", async () => {
    mockIntent("write", 0.9, "analytics");
    await expect(
      resolveChatUserIntent({
        userText: "fill the worksheet",
        mode: "plan",
        surface: "document",
      })
    ).resolves.toEqual({
      kind: "read",
      reason: "llm_analytics_surface",
      switchToAnalytics: true,
    });
    expect(generateTextMock).toHaveBeenCalledOnce();
  });

  it("does not offer the switch when Lite is unsure or stays on Report", async () => {
    mockIntent("write", 0.5, "analytics");
    await expect(
      resolveChatUserIntent({
        userText: "fill the worksheet",
        mode: "agent",
        surface: "document",
      })
    ).resolves.toEqual({ kind: "write", reason: "produce_request" });

    mockIntent("write", 0.95, "report");
    await expect(
      resolveChatUserIntent({
        userText: "put those numbers in the worksheet",
        mode: "agent",
        surface: "document",
      })
    ).resolves.toEqual({ kind: "write", reason: "produce_request" });
  });

  it("does not switch on ambiguous Agent text even if Lite names Analytics", async () => {
    mockIntent("read", 0.9, "analytics");
    await expect(
      resolveChatUserIntent({
        userText: "plan the first 3 sections",
        mode: "agent",
        surface: "document",
      })
    ).resolves.toEqual({ kind: "read", reason: "llm_read" });
  });
});

describe("documentIntentFocus", () => {
  it("uses a tagged section when scope is not all", () => {
    expect(
      documentIntentFocus({
        userText: "plan the first 3 sections",
        sectionScope: "purpose",
        documentType: "mechanical_design_verification",
        sections: {},
      })
    ).toEqual({ sectionLabel: "Purpose", fillState: "empty" });
  });
});

describe("classifyChatUserIntent hole the Lite call fills", () => {
  it("treats plan-the-sections as ambiguous Agent write before Lite", () => {
    expect(
      classifyChatUserIntent({
        userText: "plan the first 3 sections",
        mode: "agent",
      })
    ).toEqual({ kind: "write", reason: "ambiguous_agent_mode" });
    expect(
      classifyChatUserIntent({
        userText: "plan the first 3 sections",
        mode: "plan",
      }).kind
    ).toBe("read");
  });
});
