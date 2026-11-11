import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ablateGroundDraftCases,
  formatAblationReport,
} from "@/lib/eval/chat-draft-ablation";
import {
  parseChatDraftCases,
  parseChatDraftEvalArgs,
} from "@/lib/eval/chat-draft-cases";

const casesPath = path.join(
  process.cwd(),
  "scripts/eval/chat-draft-cases.json"
);

describe("parseChatDraftEvalArgs ablation", () => {
  it("selects ablation without implying Langfuse or dry-run", () => {
    expect(parseChatDraftEvalArgs(["--ablation"])).toMatchObject({
      dryRun: false,
      replay: false,
      sync: false,
      experiment: false,
      ablation: true,
      live: false,
    });
  });

  it("still rejects --live when ablation is also requested", () => {
    expect(() => parseChatDraftEvalArgs(["--ablation", "--live"])).toThrow(
      /not wired/i
    );
  });
});

describe("ablateGroundDraftCases", () => {
  const cases = parseChatDraftCases(
    JSON.parse(readFileSync(casesPath, "utf8"))
  );
  const report = ablateGroundDraftCases(cases);

  it("runs every public ground_draft case and skips harness/page_plan tasks", () => {
    const groundDraftN = cases.filter((entry) => entry.task === "ground_draft")
      .length;
    expect(report.n).toBe(groundDraftN);
    expect(report.n).toBeGreaterThanOrEqual(6);
    expect(report.attackN).toBeGreaterThanOrEqual(4);
    expect(report.sourcedN).toBe(report.n - report.attackN);
  });

  it("saves zero unsupported hard facts with Andrei on and all attack drafts with Andrei off", () => {
    expect(report.poisonedPersistOn).toBe(0);
    expect(report.poisonedPersistOff).toBe(report.attackN);
    expect(report.correctPersistOn).toBe(report.n);
    expect(report.correctPersistOff).toBe(report.sourcedN);
    const drafts = new Map(
      cases
        .filter((entry) => entry.task === "ground_draft")
        .map((entry) => [entry.id, entry.input.text])
    );
    for (const row of report.rows) {
      expect(row.off.landed).toBe(drafts.get(row.id));
      if (row.attack) {
        expect(row.on.poisonedPersist).toBe(false);
        expect(row.on.blocked).toBe(true);
        expect(row.on.landed).toBe("");
        expect(row.off.poisonedPersist).toBe(true);
      } else {
        expect(row.off.poisonedPersist).toBe(false);
        expect(row.on.blocked).toBe(false);
      }
    }
  });

  it("still persists sourced cover/range facts when the gate is on", () => {
    expect(report.keptSupportedOn).toBe(report.sourcedN);
    expect(report.keptSupportedOff).toBe(report.sourcedN);
    const cover = report.rows.find((row) => row.id === "qsr-rtm-cover-8000l");
    expect(cover?.attack).toBe(false);
    expect(cover?.on.landed).toContain("8000 L");
    expect(cover?.off.landed).toContain("8000 L");
  });

  it("blocks the 24.50 m² assistant echo only when the gate is on", () => {
    const echo = report.rows.find(
      (row) => row.id === "cvp-iq-24-50-assistant-echo-blocked"
    );
    expect(echo?.attack).toBe(true);
    expect(echo?.off.landed).toContain("24.50 m²");
    expect(echo?.on.landed).not.toContain("24.50");
    expect(echo?.off.unsupported.some((fact) => fact.includes("24.50"))).toBe(
      true
    );
  });

  it("formats a table that names both persist rates", () => {
    const printed = formatAblationReport(report);
    expect(printed).toContain("correct persist");
    expect(printed).toContain(
      `Andrei on ${String(report.n)}/${String(report.n)}   Andrei off ${String(report.sourcedN)}/${String(report.n)}`
    );
    expect(printed).toContain("poisoned persist");
    expect(printed).toContain(`Andrei on 0/${String(report.n)}`);
    expect(printed).toContain(
      `Andrei off ${String(report.poisonedPersistOff)}/${String(report.n)}`
    );
    expect(printed).toContain("cvp-iq-24-50-assistant-echo-blocked");
  });
});
