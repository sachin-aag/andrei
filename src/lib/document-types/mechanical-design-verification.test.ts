import type { JSONContent } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCriteria, getDocumentType, getWorkspaceSections } from ".";
import type { EvaluationContext } from "./types";
import {
  checkResultsTablesPresent,
  checkResultsVerdictValues,
  checkRevisionHistoryTable,
  checkUutPrototypeFootnote,
  checkUutRowsIdentified,
} from "./mechanical/deterministic-checks";
import {
  normalizeMechanicalVerdict,
  parseMechanicalResultsMatrix,
  parseUutMatrix,
} from "./mechanical/matrix-parser";
import { parseEquipmentMatrix } from "./convergent/matrix-parser";
import { checkEquipmentTablePresent } from "./convergent/deterministic-checks";
import {
  MECHANICAL_DV_SECTION_KEYS,
  MECHANICAL_RESULTS_HEADERS,
  MECHANICAL_REVISION_HISTORY_HEADERS,
  MECHANICAL_UUT_HEADERS,
} from "./mechanical/sections";

const TYPE = "mechanical_design_verification";

function tableDoc(rows: readonly (readonly string[])[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: rows.map((cells, rowIndex) => ({
          type: "tableRow",
          content: cells.map((text) => ({
            type: rowIndex === 0 ? "tableHeader" : "tableCell",
            content: [
              {
                type: "paragraph",
                content: text ? [{ type: "text", text }] : [],
              },
            ],
          })),
        })),
      },
    ],
  };
}

function narrativeDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: text ? [{ type: "text", text }] : [] },
    ],
  };
}

function ctx(content: unknown): EvaluationContext {
  return {
    section: "x",
    content,
    dependencies: {},
    report: {} as EvaluationContext["report"],
  };
}

describe("mechanical design verification definition", () => {
  it("exposes the recipe's 14 sections in report order", () => {
    const sections = getWorkspaceSections(TYPE).map((s) => s.key);
    expect(sections).toEqual([...MECHANICAL_DV_SECTION_KEYS]);
    expect(sections).toContain("executed_protocol");
    expect(sections).toContain("protocol_deviations");
    expect(sections).toContain("failure_forms");
    expect(sections).toContain("requirements_verified");
    expect(sections).toContain("revision_history");
  });

  it("keeps numbered headings out of workspace labels", () => {
    for (const section of getWorkspaceSections(TYPE)) {
      expect(section.label, section.key).not.toMatch(/^\d+(\.\d+)?\s/);
    }
  });

  it("gives every section at least one criterion", () => {
    for (const key of MECHANICAL_DV_SECTION_KEYS) {
      expect(getCriteria(TYPE, key).length, key).toBeGreaterThan(0);
    }
  });

  it("uses criterion keys that are unique across the whole type", () => {
    const keys = MECHANICAL_DV_SECTION_KEYS.flatMap((s) =>
      getCriteria(TYPE, s).map((c) => c.key)
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every deterministic criterion a check", () => {
    for (const key of MECHANICAL_DV_SECTION_KEYS) {
      for (const c of getCriteria(TYPE, key)) {
        if (c.kind === "deterministic") expect(c.check, c.key).toBeTypeOf("function");
      }
    }
  });

  it("only depends on sections this type actually has", () => {
    const known = new Set<string>(MECHANICAL_DV_SECTION_KEYS);
    for (const key of MECHANICAL_DV_SECTION_KEYS) {
      for (const c of getCriteria(TYPE, key)) {
        for (const dep of c.dependsOn ?? []) {
          expect(known.has(dep), `${c.key} -> ${dep}`).toBe(true);
        }
      }
    }
  });

  it("keeps method deviations and failures in separate sections", () => {
    expect(getCriteria(TYPE, "protocol_deviations").map((c) => c.key)).toContain(
      "protocol_deviations.scope_discipline"
    );
    expect(getCriteria(TYPE, "failure_forms").map((c) => c.key)).toContain(
      "failures.scope_discipline"
    );
  });

  it("carries no software-report criteria", () => {
    const all = MECHANICAL_DV_SECTION_KEYS.flatMap((s) =>
      getCriteria(TYPE, s)
    );
    const text = all
      .map((c) => `${c.key} ${c.label} ${c.description}`)
      .join("\n")
      .toLowerCase();
    expect(text).not.toContain("software under test");
    expect(text).not.toContain("jira");
    expect(text).not.toContain("mm.nn.ff.bb");
    expect(text).not.toContain("regression round");
  });

  it("states the single-execution and deviation-vs-failure rules in the base prompt", () => {
    const base = getDocumentType(TYPE).prompts.base;
    expect(base).toContain("SINGLE pair of protocol executions");
    expect(base).toContain("SEPARATE");
    expect(base).toContain("never whether a paragraph hits a word count");
  });

  it("prompts every section", () => {
    const perSection = getDocumentType(TYPE).prompts.perSection;
    for (const key of MECHANICAL_DV_SECTION_KEYS) {
      expect(perSection[key], key).toBeTruthy();
    }
  });

  it("has a prompt version distinct from the software DV type", () => {
    expect(getDocumentType(TYPE).prompts.promptVersion).toBe(
      "convergent-mechanical-dv-v2"
    );
    expect(getDocumentType(TYPE).prompts.promptVersion).not.toBe(
      getDocumentType("design_verification").prompts.promptVersion
    );
  });

  it("tells Agent to put table footnotes after the table, not in the lead-in", () => {
    const guidance = getDocumentType(TYPE).chat.draftingGuidance ?? "";
    expect(guidance).toContain("Do not put that footnote in the 4.2 lead-in");
    expect(guidance).toContain(
      "after the GFM table in targetField `table`, not in the three"
    );
  });

  it("runs the reused equipment check against the mechanical content shape", () => {
    const seeded = Object.fromEntries(
      getWorkspaceSections(TYPE).map((s) => [s.key, s.emptyContent])
    );
    // Seeded but empty: the columns resolve, there is just no data yet.
    expect(
      checkEquipmentTablePresent(ctx(seeded.equipment_and_calibration)).status
    ).toBe("not_met");

    const filled = {
      narrative: narrativeDoc(
        "The table below lists all equipment used for testing."
      ),
      table: tableDoc([
        [
          "Equipment",
          "Manufacturer",
          "Model / Part No.",
          "CD Asset Tag / Serial No.",
          "Calibration Due",
        ],
        [
          "Force Gauge",
          "Nidec",
          "FGV-20XY",
          "CD-1167 / S/N: Y9124H003",
          "19-Jun-2035",
        ],
      ]),
    };
    expect(checkEquipmentTablePresent(ctx(filled)).status).toBe("met");
  });

  it("seeds each table section with its own header set", () => {
    const empty = Object.fromEntries(
      getWorkspaceSections(TYPE).map((s) => [s.key, s.emptyContent])
    );
    const uut = parseUutMatrix(empty.units_under_test);
    expect(uut.ok && uut.missingColumns).toEqual([]);
    // 2.4 reuses the Convergent equipment parser, but its content is
    // { narrative, table } rather than { table } — the parser must still find it.
    const equipment = parseEquipmentMatrix(empty.equipment_and_calibration);
    expect(equipment.ok && equipment.missingColumns).toEqual([]);

    const hardware = parseMechanicalResultsMatrix(
      empty.requirements_verified,
      "hardwareTable"
    );
    const system = parseMechanicalResultsMatrix(
      empty.requirements_verified,
      "systemTable"
    );
    expect(hardware.ok && hardware.missingColumns).toEqual([]);
    expect(system.ok && system.missingColumns).toEqual([]);
  });
});

describe("mechanical verdict parsing", () => {
  it("accepts Pass, Fail and N/A, with or without a footnote asterisk", () => {
    expect(normalizeMechanicalVerdict("Pass")).toBe("pass");
    expect(normalizeMechanicalVerdict("Pass*")).toBe("pass");
    expect(normalizeMechanicalVerdict("Fail**")).toBe("fail");
    expect(normalizeMechanicalVerdict("N/A")).toBe("na");
    expect(normalizeMechanicalVerdict("N/A*")).toBe("na");
    expect(normalizeMechanicalVerdict("Not Applicable")).toBe("na");
  });

  it("rejects the software report's per-configuration verdicts", () => {
    expect(normalizeMechanicalVerdict("P for TOP-00017 PCON")).toBeNull();
    expect(normalizeMechanicalVerdict("")).toBeNull();
  });
});

describe("mechanical deterministic checks", () => {
  const uutRows = [
    [...MECHANICAL_UUT_HEADERS],
    ["Solea Model 3 System", "Convergent Dental", "TOP-00017", "0300650", "N/A"],
  ];

  it("flags a blank serial number but accepts N/A", () => {
    const blank = checkUutRowsIdentified(
      ctx({
        narrative: narrativeDoc(""),
        table: tableDoc([
          [...MECHANICAL_UUT_HEADERS],
          ["Perioguide Tip", "Convergent Dental", "SUB-00445", "", "5"],
        ]),
      })
    );
    expect(blank.status).toBe("partially_met");
    expect(blank.reasoning).toContain("Serial Number");

    expect(
      checkUutRowsIdentified(
        ctx({ narrative: narrativeDoc(""), table: tableDoc(uutRows) })
      ).status
    ).toBe("met");
  });

  it("requires a footnote when a revision is asterisked", () => {
    const starred = tableDoc([
      [...MECHANICAL_UUT_HEADERS],
      ["Ultraguide Collet Assembly", "Convergent Dental", "SUB-00450", "N/A", "6*"],
    ]);
    expect(
      checkUutPrototypeFootnote(
        ctx({ narrative: narrativeDoc("Three assemblies were used."), table: starred })
      ).status
    ).toBe("not_met");
    expect(
      checkUutPrototypeFootnote(
        ctx({
          narrative: narrativeDoc(
            "*The adapter was a prototype that was functionally equivalent to SUB-00450 Rev. 6"
          ),
          table: starred,
        })
      ).status
    ).toBe("met");
    expect(
      checkUutPrototypeFootnote(
        ctx({
          narrative: narrativeDoc("Three assemblies were used."),
          table: {
            type: "doc",
            content: [
              ...(starred.content ?? []),
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "*The adapter was a prototype that was functionally equivalent to SUB-00450 Rev. 6",
                  },
                ],
              },
            ],
          },
        })
      ).status
    ).toBe("met");
    expect(
      checkUutPrototypeFootnote(
        ctx({ narrative: narrativeDoc(""), table: tableDoc(uutRows) })
      ).status
    ).toBe("met");
  });

  it("requires both results tables to be populated", () => {
    const filled = tableDoc([
      [...MECHANICAL_RESULTS_HEADERS],
      ["M3-HRS-GN-001", "All Components shall be RoHS compliant.", "Refer to 726-00003 Rev. A.", "Pass"],
    ]);
    const empty = tableDoc([[...MECHANICAL_RESULTS_HEADERS]]);

    expect(
      checkResultsTablesPresent(
        ctx({ narrative: narrativeDoc(""), hardwareTable: filled, systemTable: empty })
      ).status
    ).toBe("partially_met");
    expect(
      checkResultsTablesPresent(
        ctx({ narrative: narrativeDoc(""), hardwareTable: filled, systemTable: filled })
      ).status
    ).toBe("met");
  });

  it("rejects a verdict that is not Pass, Fail or N/A", () => {
    const bad = tableDoc([
      [...MECHANICAL_RESULTS_HEADERS],
      ["M3-SYS-FN-001", "Output power shall not vary.", "See data sheets.", "P for TOP-00017"],
    ]);
    const good = tableDoc([
      [...MECHANICAL_RESULTS_HEADERS],
      ["M3-SYS-FN-001", "Output power shall not vary.", "See data sheets.", "Pass"],
      ["M3-HRS-BD-011", "Power shall not drop 20%.", "Refer to Deviation #2.", "N/A*"],
    ]);
    const result = checkResultsVerdictValues(
      ctx({ narrative: narrativeDoc(""), hardwareTable: bad, systemTable: good })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toContain("P for TOP-00017");

    expect(
      checkResultsVerdictValues(
        ctx({ narrative: narrativeDoc(""), hardwareTable: good, systemTable: good })
      ).status
    ).toBe("met");
  });

  it("requires sequential revision letters from A", () => {
    const headers = [...MECHANICAL_REVISION_HISTORY_HEADERS];
    const ok = checkRevisionHistoryTable(
      ctx({
        table: tableDoc([
          headers,
          ["A", "31-Oct-2024", "DCO-02058", "Initial release.", "W. Harrington / D. Burke"],
        ]),
      })
    );
    expect(ok.status).toBe("met");

    const skipped = checkRevisionHistoryTable(
      ctx({
        table: tableDoc([
          headers,
          ["A", "31-Oct-2024", "DCO-02058", "Initial release.", "W. Harrington"],
          ["C", "02-Feb-2025", "DCO-02100", "Second release.", "D. Burke"],
        ]),
      })
    );
    expect(skipped.status).toBe("partially_met");
    expect(skipped.reasoning).toContain("expected A, B");
  });
});

describe("customer pack wiring", () => {
  const previous = {
    ANDREI_CUSTOMER: process.env.ANDREI_CUSTOMER,
    NEXT_PUBLIC_ANDREI_CUSTOMER: process.env.NEXT_PUBLIC_ANDREI_CUSTOMER,
    ANDREI_VERCEL_DEPLOY_SCOPE: process.env.ANDREI_VERCEL_DEPLOY_SCOPE,
  };

  beforeEach(() => {
    process.env.ANDREI_CUSTOMER = "convergent";
    process.env.NEXT_PUBLIC_ANDREI_CUSTOMER = "convergent";
    delete process.env.ANDREI_VERCEL_DEPLOY_SCOPE;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("does not change the software DV type's section shape", () => {
    const software = getWorkspaceSections("design_verification").map((s) => s.key);
    expect(software).not.toContain("executed_protocol");
    expect(software).not.toContain("requirements_verified");
    expect(software).toContain("results_and_discussions");
  });
});
