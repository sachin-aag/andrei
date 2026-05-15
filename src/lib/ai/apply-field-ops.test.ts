import { describe, expect, it } from "vitest";
import {
  appendAtPath,
  applyFieldOps,
  parsePath,
  setNestedPath,
} from "@/lib/ai/apply-field-ops";

describe("parsePath", () => {
  it("parses dot-only paths", () => {
    expect(parsePath("sixM.man")).toEqual(["sixM", "man"]);
  });

  it("parses bracket indices on a segment", () => {
    expect(parsePath("correctiveActions[0].dueDate")).toEqual([
      "correctiveActions",
      0,
      "dueDate",
    ]);
  });

  it("parses multiple bracket indices on one segment", () => {
    expect(parsePath("a[0][1].b")).toEqual(["a", 0, 1, "b"]);
  });

  it("returns null for empty or invalid paths", () => {
    expect(parsePath("")).toBeNull();
    expect(parsePath("..x")).toBeNull();
    expect(parsePath("x[-1]")).toBeNull();
  });

  it("rejects prototype pollution segments", () => {
    expect(parsePath("__proto__.x")).toBeNull();
    expect(parsePath("constructor.foo")).toBeNull();
    expect(parsePath("prototype.bar")).toBeNull();
  });
});

describe("setNestedPath", () => {
  it("sets a nested string leaf on analyze-shaped content", () => {
    const root = {
      sixM: {
        man: "",
        machine: "",
      },
    } as Record<string, unknown>;
    expect(setNestedPath(root, "sixM.man", "Operator error ruled out.")).toBe(true);
    expect(root.sixM).toEqual({ man: "Operator error ruled out.", machine: "" });
  });

  it("sets root-level leaf when parent is the root object", () => {
    const root = {
      investigationOutcome: "",
    } as Record<string, unknown>;
    expect(
      setNestedPath(root, "investigationOutcome", "Outcome text.")
    ).toBe(true);
    expect(root.investigationOutcome).toBe("Outcome text.");
  });

  it("sets existing array index", () => {
    const root = {
      correctiveActions: [
        { id: "a", description: "old" },
      ],
    } as Record<string, unknown>;
    expect(
      setNestedPath(root, "correctiveActions[0].description", "new text")
    ).toBe(true);
    expect((root.correctiveActions as { description: string }[])[0].description).toBe(
      "new text"
    );
  });

  it("returns false when parent key is missing (no vivification)", () => {
    const root = { sixM: { man: "" } } as Record<string, unknown>;
    expect(setNestedPath(root, "sixM.missingKey.x", "nope")).toBe(false);
  });

  it("returns false when array index is out of range", () => {
    const root = { items: [{ id: "1" }] } as Record<string, unknown>;
    expect(setNestedPath(root, "items[2].id", "x")).toBe(false);
  });
});

describe("appendAtPath", () => {
  it("pushes to an existing array and injects id", () => {
    const root = {
      correctiveActions: [] as unknown[],
    } as Record<string, unknown>;
    const gen = () => "fixed-id";
    expect(
      appendAtPath(
        root,
        "correctiveActions",
        {
          description: "Do X",
          responsiblePerson: "Emp. 1",
          dueDate: "2026-06-01",
          expectedOutcome: "Verified",
          effectivenessVerification: "Not required; rationale.",
          id: "should-be-stripped",
        },
        gen
      )
    ).toBe(true);
    expect(root.correctiveActions).toEqual([
      {
        id: "fixed-id",
        description: "Do X",
        responsiblePerson: "Emp. 1",
        dueDate: "2026-06-01",
        expectedOutcome: "Verified",
        effectivenessVerification: "Not required; rationale.",
      },
    ]);
  });

  it("creates the array when null", () => {
    const root = { correctiveActions: null } as Record<string, unknown>;
    expect(
      appendAtPath(root, "correctiveActions", { description: "A" }, () => "id-1")
    ).toBe(true);
    expect(root.correctiveActions).toEqual([{ id: "id-1", description: "A" }]);
  });

  it("returns false when target exists but is not array or null", () => {
    const root = { correctiveActions: "bad" } as Record<string, unknown>;
    expect(
      appendAtPath(root, "correctiveActions", { description: "x" }, () => "id")
    ).toBe(false);
  });
});

describe("applyFieldOps", () => {
  it("applies analyze-shaped field updates without mutating the input", () => {
    const input = {
      fiveWhy: { narrative: "", conclusion: "" },
      investigationOutcome: "",
    };
    const snapshot = JSON.stringify(input);
    const { next, anyApplied } = applyFieldOps(input as Record<string, unknown>, [
      { op: "set", path: "fiveWhy.narrative", value: "1. Why?\\nAns. Because." },
      { op: "set", path: "investigationOutcome", value: "Summarized." },
    ]);
    expect(anyApplied).toBe(true);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect((next.fiveWhy as { narrative: string }).narrative).toContain("Why?");
    expect(next.investigationOutcome).toBe("Summarized.");
  });

  it("drops individual bad ops but applies good ones", () => {
    const input = { sixM: { man: "" } } as Record<string, unknown>;
    const { next, anyApplied } = applyFieldOps(input, [
      { op: "set", path: "sixM.nonexistent.x", value: "skip" },
      { op: "set", path: "sixM.man", value: "ok" },
    ]);
    expect(anyApplied).toBe(true);
    expect((next.sixM as { man: string }).man).toBe("ok");
  });

  it("normalizes bracket placeholders inside string values", () => {
    const input = { sixM: { man: "[number]" } } as Record<string, unknown>;
    const { next, anyApplied } = applyFieldOps(input, [
      { op: "set", path: "sixM.man", value: "[count]" },
    ]);
    expect(anyApplied).toBe(true);
    expect((next.sixM as { man: string }).man).toBe("[count: <to be filled>]");
  });

  it("normalizes bracket placeholders in append payloads", () => {
    const root = { correctiveActions: [] as unknown[] } as Record<string, unknown>;
    const { next, anyApplied } = applyFieldOps(root, [
      {
        op: "append",
        path: "correctiveActions",
        value: { description: "[responsible]" },
      },
    ]);
    expect(anyApplied).toBe(true);
    expect(((next.correctiveActions as { description: string }[])[0]).description).toBe(
      "[responsible: <to be filled>]"
    );
  });

  it("returns anyApplied false when every op fails", () => {
    const { anyApplied } = applyFieldOps({} as Record<string, unknown>, [
      { op: "set", path: "missing.leaf", value: "x" },
    ]);
    expect(anyApplied).toBe(false);
  });
});
