import { describe, expect, it } from "vitest";
import type { LanguageModel } from "ai";
import { HARNESS_SCENARIOS } from "@/lib/ai/chat/harness-scenarios";
import {
  formatLiveAblationReport,
  LIVE_MINIMAL_SYSTEM_PROMPT,
  runLiveAblation,
  scoreLiveHarnessTools,
} from "@/lib/eval/live-gemini-ablation";

const dummyModel = {} as LanguageModel;

describe("scoreLiveHarnessTools", () => {
  it("fails a greeting that writes or searches", () => {
    expect(scoreLiveHarnessTools("greeting", []).passed).toBe(true);
    expect(scoreLiveHarnessTools("greeting", ["draft_field"]).label).toBe(
      "wrote on hello"
    );
    expect(scoreLiveHarnessTools("greeting", ["search_documents"]).label).toBe(
      "searched on hello"
    );
  });

  it("fails an empty inventory that writes before a review or never starts one", () => {
    expect(
      scoreLiveHarnessTools("empty_inventory", ["edit_table"]).label
    ).toBe("wrote into empty table");
    expect(
      scoreLiveHarnessTools("empty_inventory", ["list_attachments"]).label
    ).toBe("skipped the review");
    expect(
      scoreLiveHarnessTools("empty_inventory", [
        "start_document_review",
        "edit_table",
      ]).passed
    ).toBe(true);
  });

  it("fails a rewrite or lookup that starts a page walk", () => {
    expect(
      scoreLiveHarnessTools("sentence_rewrite", ["start_document_review"]).passed
    ).toBe(false);
    expect(
      scoreLiveHarnessTools("identifier_lookup", ["draft_field"]).passed
    ).toBe(false);
    expect(
      scoreLiveHarnessTools("placeholder_fill", ["search_documents"]).passed
    ).toBe(true);
  });
});

describe("runLiveAblation", () => {
  it("scores Andrei on vs a minimal-prompt off arm from real tool calls", async () => {
    const report = await runLiveAblation({
      model: dummyModel,
      modelLabel: "mock",
      provider: "openai",
      usedGemini: false,
      generateTextFn: async (args) => {
        const system = String(args.system ?? "");
        const isOff = system === LIVE_MINIMAL_SYSTEM_PROMPT;
        const user =
          Array.isArray(args.messages) &&
          args.messages[0] &&
          typeof args.messages[0] === "object" &&
          "content" in args.messages[0]
            ? String(args.messages[0].content)
            : "";
        const lower = user.toLowerCase();
        const toolName = isOff
          ? lower === "hi"
            ? "draft_field"
            : lower.includes("calibration")
              ? "edit_table"
              : "start_document_review"
          : lower === "hi"
            ? undefined
            : lower.includes("where")
              ? "search_documents"
              : lower.includes("change")
                ? "read_section"
                : lower.includes("placeholder")
                  ? "search_documents"
                  : "start_document_review";
        return {
          text: isOff ? "" : "ok",
          steps: toolName
            ? [{ toolCalls: [{ toolName, type: "tool-call" }] }]
            : [],
          toolCalls: toolName ? [{ toolName }] : [],
        };
      },
    });

    expect(report.n).toBe(HARNESS_SCENARIOS.length);
    expect(report.correctOn).toBe(HARNESS_SCENARIOS.length);
    expect(report.correctOff).toBe(0);
    const greeting = report.rows.find((row) => row.id === "greeting");
    expect(greeting?.on.label).toBe("stayed quiet");
    expect(greeting?.off.label).toBe("wrote on hello");
    expect(greeting?.off.toolNames).toEqual(["draft_field"]);
    const printed = formatLiveAblationReport(report);
    expect(printed).toContain("Andrei on 5/5   base model 0/5");
    expect(printed).toContain("minimal system prompt");
    expect(printed).not.toContain("persist-gate");
  });
});
