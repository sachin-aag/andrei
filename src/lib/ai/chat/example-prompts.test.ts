import { describe, expect, it } from "vitest";
import type { DocumentType } from "@/db/schema";
import { DEFAULT_CHAT_COMPOSER_PREFS } from "./composer-prefs";
import {
  ANALYTICS_EXAMPLE_PROMPTS,
  documentEmptyChatIntro,
  examplePromptsForDocument,
  examplePromptsForMode,
} from "./example-prompts";
import { getDocumentType } from "@/lib/document-types";
import { convergentDesignVerificationDefinition } from "@/lib/document-types/convergent-design-verification";
import { defaultDesignVerificationDefinition } from "@/lib/document-types/design-verification";

const ALL_TYPES: DocumentType[] = [
  "investigation_report",
  "design_verification",
  "mechanical_design_verification",
  "quality_risk_assessment",
  "generic_document",
];

function chipText(def: { chat: { examplePrompts: { plan: readonly string[]; agent: readonly string[] } } }) {
  return [...def.chat.examplePrompts.plan, ...def.chat.examplePrompts.agent].join(
    "\n"
  );
}

describe("examplePromptsForMode", () => {
  it("returns investigation chips when the type is a deviation", () => {
    const investigation = examplePromptsForDocument("investigation_report");
    expect(examplePromptsForMode("plan", "investigation_report")).toEqual(
      investigation.plan
    );
    expect(examplePromptsForMode("agent", "investigation_report")).toEqual(
      investigation.agent
    );
    expect(investigation.agent.join("\n")).toMatch(/Define/);
    expect(investigation.agent.join("\n")).toMatch(/Analyze/);
  });

  it("names Purpose & Scope on a design-verification report, not Define", () => {
    const chips = defaultDesignVerificationDefinition.chat.examplePrompts.agent;
    expect(examplePromptsForMode("agent", "design_verification")).toEqual(
      getDocumentType("design_verification").chat.examplePrompts.agent
    );
    expect(chips.join("\n")).toContain("Purpose & Scope");
    expect(chips.join("\n")).not.toMatch(/\bDefine\b/);
    expect(chips.join("\n")).not.toMatch(/\bAnalyze\b/);
  });

  it("does not throw when mode is missing after a composer remount", () => {
    const investigation = examplePromptsForDocument("investigation_report");
    expect(examplePromptsForMode("", "investigation_report")).toEqual(
      investigation[DEFAULT_CHAT_COMPOSER_PREFS.mode]
    );
    expect(examplePromptsForMode(undefined)).toEqual(investigation.agent);
  });
});

describe("documentEmptyChatIntro", () => {
  it("uses the report noun instead of deviation investigation on DV", () => {
    const intro = documentEmptyChatIntro({
      mode: "agent",
      workspaceChrome: "document",
      documentType: "design_verification",
    });
    expect(intro).toContain("design verification");
    expect(intro).not.toContain("deviation investigation");
  });

  it("keeps Ask mode from offering edits", () => {
    expect(
      documentEmptyChatIntro({
        mode: "plan",
        workspaceChrome: "document",
        documentType: "quality_risk_assessment",
      })
    ).toContain("I won't edit the document in Ask mode");
  });
});

describe("chat.examplePrompts per document type", () => {
  it("names this type's sections and never DMAIC unless the type has them", () => {
    for (const type of ALL_TYPES) {
      const def = getDocumentType(type);
      const text = chipText(def);
      const labels = def.sections
        .filter((section) => section.editable && !section.virtual)
        .map((section) => section.label);
      const lower = text.toLowerCase();
      expect(
        labels.some((label) => lower.includes(label.toLowerCase()))
      ).toBe(true);
      if (!labels.includes("Define")) {
        expect(text).not.toMatch(/\bDefine\b/);
      }
      if (!labels.includes("Analyze")) {
        expect(text).not.toMatch(/\bAnalyze\b/);
      }
    }
  });

  it("uses Convergent Purpose / Scope chips, not Purpose & Scope", () => {
    const text = chipText(convergentDesignVerificationDefinition);
    expect(text).toContain("Purpose");
    expect(text).toContain("Scope");
    expect(text).not.toContain("Purpose & Scope");
    expect(text).not.toMatch(/\bDefine\b/);
  });

  it("does not mention quality criteria on generic documents", () => {
    const text = chipText(getDocumentType("generic_document"));
    expect(text.toLowerCase()).not.toContain("quality criteria");
    expect(text.toLowerCase()).toContain("document");
  });
});

describe("ANALYTICS_EXAMPLE_PROMPTS", () => {
  it("offers a boxplot chip in Agent mode", () => {
    expect(ANALYTICS_EXAMPLE_PROMPTS.agent.join("\n")).toMatch(/Boxplot Assay by Lot/i);
  });
});
