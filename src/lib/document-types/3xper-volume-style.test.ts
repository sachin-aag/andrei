import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  compact3xperLitreVolumes,
  compact3xperLitreVolumesInDoc,
  usesCvpKLitreStyle,
} from "./3xper-volume-style";

describe("compact3xperLitreVolumes", () => {
  it("writes round-thousand litres as k L", () => {
    expect(compact3xperLitreVolumes("10000 L")).toBe("10k L");
    expect(compact3xperLitreVolumes("10,000 L")).toBe("10k L");
    expect(compact3xperLitreVolumes("8000 L")).toBe("8k L");
    expect(compact3xperLitreVolumes("1000 L")).toBe("1k L");
    expect(compact3xperLitreVolumes("Capacity 10000 L [1]")).toBe(
      "Capacity 10k L [1]"
    );
  });

  it("leaves small litres, millilitres, kilograms, and printed KL", () => {
    expect(compact3xperLitreVolumes("150 L")).toBe("150 L");
    expect(compact3xperLitreVolumes("37 L")).toBe("37 L");
    expect(compact3xperLitreVolumes("773 L")).toBe("773 L");
    expect(compact3xperLitreVolumes("8800 L")).toBe("8800 L");
    expect(compact3xperLitreVolumes("10 ml")).toBe("10 ml");
    expect(compact3xperLitreVolumes("10000 kg")).toBe("10000 kg");
    expect(compact3xperLitreVolumes("10 KL")).toBe("10 KL");
    expect(compact3xperLitreVolumes("3.0 KL")).toBe("3.0 KL");
    expect(compact3xperLitreVolumes("10k L")).toBe("10k L");
    expect(compact3xperLitreVolumes("SS 316L")).toBe("SS 316L");
  });
});

describe("compact3xperLitreVolumesInDoc", () => {
  it("rewrites text nodes inside a table cell", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "10000 L" }],
        },
      ],
    };
    expect(JSON.stringify(compact3xperLitreVolumesInDoc(doc))).toContain(
      "10k L"
    );
    expect(JSON.stringify(compact3xperLitreVolumesInDoc(doc))).not.toContain(
      "10000 L"
    );
  });
});

describe("usesCvpKLitreStyle", () => {
  it("is true for CVP sections only", () => {
    expect(usesCvpKLitreStyle("cvp_equipment_sampling")).toBe(true);
    expect(usesCvpKLitreStyle("cvp_scope")).toBe(true);
    expect(usesCvpKLitreStyle("qsr_process_rtm")).toBe(false);
    expect(usesCvpKLitreStyle("identity")).toBe(false);
    expect(usesCvpKLitreStyle(undefined)).toBe(false);
  });
});
