import fs from "node:fs";
import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { DEMO_PACK, MJ_PACK, isDocumentTypeEnabled } from "@/lib/customers/packs";
import { getCriteria, getDocumentType, getWorkspaceSections } from ".";
import type { EvaluationContext } from "./types";
import {
  checkAlarmDirectImpactAction,
  checkBreakdownRepeatCapa,
  checkCalibrationStatus,
  checkMonitoringExcursionsLinked,
  checkPreventiveMaintenanceJustified,
  checkPrqScheduleCurrent,
  checkQmsQualificationFollowUp,
  checkQmsRecords,
  checkQualificationFormatScope,
  checkRecommendationSelected,
} from "./elr/deterministic-checks";
import {
  ELR_ALARM_HEADERS,
  ELR_BREAKDOWN_HEADERS,
  ELR_CALIBRATION_HEADERS,
  ELR_MONITORING_HEADERS,
  ELR_PREVENTIVE_MAINTENANCE_HEADERS,
  ELR_QMS_HEADERS,
  ELR_QUALIFICATION_HEADERS,
  ELR_SECTION_KEYS,
  ELR_SECTION_LABELS,
  EMPTY_ELR_CONTENT,
} from "./elr/sections";

const TYPE = "equipment_lifecycle_report";

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

/** Build a data row positionally against a header tuple. */
function row(
  headers: readonly string[],
  values: Record<string, string>
): string[] {
  return [...headers].map((header) => values[header] ?? "");
}

function ctx(
  content: unknown,
  {
    section = "elr_monitoring",
    dependencies = {},
    formatScope = "Vial",
    metadata = {},
  }: {
    section?: string;
    dependencies?: Record<string, unknown>;
    formatScope?: string;
    metadata?: Record<string, unknown>;
  } = {}
): EvaluationContext {
  return {
    section: section as EvaluationContext["section"],
    content,
    dependencies,
    report: {
      metadata: { formatScope, ...metadata },
    } as unknown as EvaluationContext["report"],
  };
}

function narrative(text: string): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

describe("equipment lifecycle report definition", () => {
  it("exposes ELR sections in report order with elr_ prefixes", () => {
    const sections = getWorkspaceSections(TYPE).map((s) => s.key);
    expect(sections).toEqual([...ELR_SECTION_KEYS]);
    expect(sections.every((key) => key.startsWith("elr_"))).toBe(true);
  });

  it("keeps form numbering out of workspace labels", () => {
    for (const key of ELR_SECTION_KEYS) {
      expect(ELR_SECTION_LABELS[key]).not.toMatch(/^\d/);
    }
  });

  it("mirrors the MJ F10 report shape", () => {
    const sections = getWorkspaceSections(TYPE).map((s) => s.key);
    // F10 calls section 1 "Purpose", and carries an abbreviations block plus a
    // discrepancy section that our first draft was missing.
    expect(ELR_SECTION_LABELS.elr_objective).toBe("Purpose");
    expect(sections).toContain("elr_abbreviations");
    expect(sections).toContain("elr_discrepancies");
    // Discrepancy sits after the evidence sections and before the conclusion.
    expect(sections.indexOf("elr_discrepancies")).toBeGreaterThan(
      sections.indexOf("elr_csv_status")
    );
    expect(sections.indexOf("elr_discrepancies")).toBeLessThan(
      sections.indexOf("elr_conclusion")
    );
  });

  it("seeds a starter glossary that no criterion enforces", () => {
    const rows = EMPTY_ELR_CONTENT.elr_abbreviations.table.content?.[0]?.content ?? [];
    expect(rows.length).toBeGreaterThan(1);
    expect(getCriteria(TYPE, "elr_abbreviations")).toHaveLength(0);
  });

  it("seeds empty content for every section", () => {
    for (const key of ELR_SECTION_KEYS) {
      expect(EMPTY_ELR_CONTENT[key]).toBeDefined();
    }
  });

  it("treats the evidence tables as open-set inventories for chat", () => {
    const def = getDocumentType(TYPE);
    expect(def.chat.inventorySections).toContain("elr_qualification");
    expect(def.chat.inventorySections).toContain("elr_qms");
    expect(def.chat.inventorySections).not.toContain("elr_objective");
    expect(def.chat.inventorySections).not.toContain("elr_scope");
    expect(def.prompts.promptVersion).toBe("mj-elr-sop-014-r04-v1");
  });

  it("maps every section into the export template data", () => {
    const def = getDocumentType(TYPE);
    const data = def.export.buildTemplateData({
      report: {
        documentNo: "ELR-26-PR-001",
        metadata: { equipmentId: "E/PR/070", formatScope: "Vial" },
      } as unknown as Parameters<typeof def.export.buildTemplateData>[0]["report"],
      sections: ELR_SECTION_KEYS.map((section) => ({
        section,
        content: EMPTY_ELR_CONTENT[section],
      })),
      ctx: undefined,
      comments: [],
    });
    expect(data.equipmentId).toBe("E/PR/070");
    expect(data.formatScope).toBe("Vial");
    // Trend sub-fields are separate placeholders in the docx template.
    expect(data).toHaveProperty("breakdownTrendXml");
    expect(data).toHaveProperty("alarmTrendXml");
  });
});

describe("ELR cross-reference checks", () => {
  it("fails a monitoring excursion with no linked deviation", () => {
    const table = tableDoc([
      [...ELR_MONITORING_HEADERS],
      row(ELR_MONITORING_HEADERS, {
        "Sr. No.": "1",
        "Monitoring Parameter": "Non-viable particle count",
        "Excursion (Y/N)": "Y",
      }),
    ]);
    const result = checkMonitoringExcursionsLinked(ctx({ table }));
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/excursion with no linked deviation/i);
  });

  it("passes a monitoring excursion that carries a deviation", () => {
    const table = tableDoc([
      [...ELR_MONITORING_HEADERS],
      row(ELR_MONITORING_HEADERS, {
        "Sr. No.": "1",
        "Monitoring Parameter": "Non-viable particle count",
        "Excursion (Y/N)": "Y",
        "Linked Deviation Ref.": "DEV-26-011",
      }),
    ]);
    expect(checkMonitoringExcursionsLinked(ctx({ table })).status).toBe("met");
  });

  it("treats an NA reference cell as unlinked", () => {
    const table = tableDoc([
      [...ELR_MONITORING_HEADERS],
      row(ELR_MONITORING_HEADERS, {
        "Sr. No.": "1",
        "Monitoring Parameter": "Differential pressure",
        "Excursion (Y/N)": "Yes",
        "Linked Deviation Ref.": "NA",
      }),
    ]);
    expect(checkMonitoringExcursionsLinked(ctx({ table })).status).toBe("not_met");
  });

  it("requires a CAPA for an out-of-tolerance calibration", () => {
    const table = tableDoc([
      [...ELR_CALIBRATION_HEADERS],
      row(ELR_CALIBRATION_HEADERS, {
        "Sr. No.": "1",
        "Instrument ID / Tag": "E/PR/070/PT 2E-00",
        "Result (Pass / OOT)": "OOT",
      }),
    ]);
    const result = checkCalibrationStatus(ctx({ table }, { section: "elr_calibration" }));
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/out of tolerance/i);
  });

  it("requires a justification for a delayed PM", () => {
    const table = tableDoc([
      [...ELR_PREVENTIVE_MAINTENANCE_HEADERS],
      row(ELR_PREVENTIVE_MAINTENANCE_HEADERS, {
        "Sr. No.": "1",
        "PM Checklist No.": "PMC/PR/014",
        "Status (On-time / Delayed)": "Delayed",
      }),
    ]);
    const result = checkPreventiveMaintenanceJustified(
      ctx({ table }, { section: "elr_preventive_maintenance" })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/justification/i);
  });

  it("requires a CAPA for a repeat breakdown", () => {
    const table = tableDoc([
      [...ELR_BREAKDOWN_HEADERS],
      row(ELR_BREAKDOWN_HEADERS, {
        "Sr. No.": "1",
        "Component / Failure Description": "Peristaltic pump 3 dosing fault",
        "Repeat (Y/N)": "Y",
      }),
    ]);
    const result = checkBreakdownRepeatCapa(
      ctx({ table }, { section: "elr_breakdowns" })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/repeat failure with no linked CAPA/i);
  });

  it("requires an action reference for a Direct Impact alarm only", () => {
    const headers = ELR_ALARM_HEADERS;
    const direct = tableDoc([
      [...headers],
      row(headers, {
        "Sr. No.": "1",
        "Alarm Code": "1951",
        "Alarm Description": "FM Stirrer Motor Not Running",
        "Criticality (DI / II)": "Direct Impact",
        "No. of Repetitions": "128",
      }),
    ]);
    expect(
      checkAlarmDirectImpactAction(ctx({ table: direct }, { section: "elr_alarms" }))
        .status
    ).toBe("not_met");

    const indirect = tableDoc([
      [...headers],
      row(headers, {
        "Sr. No.": "1",
        "Alarm Code": "1950",
        "Alarm Description": "FM Nitrogen Not Available",
        "Criticality (DI / II)": "Indirect Impact",
        "No. of Repetitions": "0",
      }),
    ]);
    expect(
      checkAlarmDirectImpactAction(ctx({ table: indirect }, { section: "elr_alarms" }))
        .status
    ).toBe("met");
  });
});

describe("ELR container-format scoping", () => {
  const headers = ELR_QUALIFICATION_HEADERS;

  it("rejects a row belonging to the counterpart format", () => {
    const table = tableDoc([
      [...headers],
      row(headers, {
        "Sr. No.": "1",
        "Qualification Stage": "PQ",
        "Protocol / Report No.": "PQR-24-PR-042",
        "Format Applicability": "Cartridge",
        Outcome: "Pass",
      }),
    ]);
    const result = checkQualificationFormatScope(
      ctx({ table }, { section: "elr_qualification", formatScope: "Vial" })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/another format/i);
  });

  it("accepts this format and Line-common rows", () => {
    const table = tableDoc([
      [...headers],
      row(headers, {
        "Sr. No.": "1",
        "Qualification Stage": "PQ",
        "Protocol / Report No.": "PQR-24-PR-102",
        "Format Applicability": "Vial",
        Outcome: "Pass",
      }),
      row(headers, {
        "Sr. No.": "2",
        "Qualification Stage": "IQ",
        "Protocol / Report No.": "CSV-IQ-PR-078",
        "Format Applicability": "Line-common",
        Outcome: "Pass",
      }),
    ]);
    expect(
      checkQualificationFormatScope(
        ctx({ table }, { section: "elr_qualification", formatScope: "Vial" })
      ).status
    ).toBe("met");
  });

  it("flags rows with no applicability as partially met", () => {
    const table = tableDoc([
      [...headers],
      row(headers, {
        "Sr. No.": "1",
        "Qualification Stage": "OQ",
        "Protocol / Report No.": "CSV-OQ-PR-055",
        Outcome: "Pass",
      }),
    ]);
    expect(
      checkQualificationFormatScope(
        ctx({ table }, { section: "elr_qualification", formatScope: "Vial" })
      ).status
    ).toBe("partially_met");
  });

  it("blocks evaluation when the report has no container format", () => {
    const table = tableDoc([[...headers]]);
    const result = checkQualificationFormatScope(
      ctx({ table }, { section: "elr_qualification", formatScope: "" })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/container format/i);
  });

  it("rejects a QMS row scoped to the counterpart format", () => {
    const table = tableDoc([
      [...ELR_QMS_HEADERS],
      row(ELR_QMS_HEADERS, {
        "Sr. No.": "1",
        "Type (CC / Dev / CAPA / OOS / OOT)": "CC",
        "Document Reference No.": "CCF/EU/26/007",
        "Title / Description": "PM checklist revision",
        "Format Applicability": "Cartridge",
        Status: "Closed",
        "Qualification Impact (Y/N)": "N",
      }),
    ]);
    const result = checkQmsRecords(
      ctx({ table }, { section: "elr_qms", formatScope: "Vial" })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/not this ELR's format/i);
  });
});

describe("ELR criteria wiring", () => {
  it("attaches the qualification dependency to the QMS follow-up check", () => {
    const criteria = getCriteria(TYPE, "elr_qms");
    const cross = criteria.find((c) => c.key === "qms.qualification_follow_up");
    expect(cross?.kind).toBe("deterministic");
    expect(cross?.dependsOn).toContain("elr_qualification");
  });

  // Attachments and abbreviations are boilerplate registers, not judgments.
  const CRITERIA_FREE_SECTIONS = ["elr_attachments", "elr_abbreviations"];

  it("gives every evaluable section at least one criterion except the registers", () => {
    for (const key of ELR_SECTION_KEYS) {
      const criteria = getCriteria(TYPE, key);
      if (CRITERIA_FREE_SECTIONS.includes(key)) {
        expect(criteria).toHaveLength(0);
        continue;
      }
      expect(criteria.length).toBeGreaterThan(0);
    }
  });

  it("routes the conclusion through the discrepancy section", () => {
    const criteria = getCriteria(TYPE, "elr_conclusion");
    const decision = criteria.find((c) => c.key === "conclusion.states_decision");
    expect(decision?.dependsOn).toContain("elr_discrepancies");
  });
});

describe("ELR periodic re-qualification schedule", () => {
  const schedule = (metadata: Record<string, unknown>) =>
    checkPrqScheduleCurrent(
      ctx({}, { section: "elr_qualification", metadata })
    );

  it("flags a next PRQ that fell due before the ELR cut-off", () => {
    const result = schedule({
      nextPrqDate: "2026-08-15",
      periodTo: "2026-09-30",
    });
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/overdue|superseded/i);
  });

  it("flags a next PRQ falling exactly on the cut-off", () => {
    expect(
      schedule({ nextPrqDate: "2026-09-30", periodTo: "2026-09-30" }).status
    ).toBe("not_met");
  });

  it("passes when the next PRQ falls after the period", () => {
    const result = schedule({
      nextPrqDate: "2027-02-15",
      periodTo: "2026-09-30",
    });
    expect(result.status).toBe("met");
  });

  it("asks for the dates when the identity block is incomplete", () => {
    expect(schedule({ periodTo: "2026-09-30" }).status).toBe("not_met");
    expect(schedule({ nextPrqDate: "2027-02-15" }).reasoning).toMatch(
      /period end/i
    );
  });
});

describe("ELR qualification follow-up", () => {
  const cc = (impact: string, ref = "CCF/EU/26/007") =>
    tableDoc([
      [...ELR_QMS_HEADERS],
      row(ELR_QMS_HEADERS, {
        "Sr. No.": "1",
        "Type (CC / Dev / CAPA / OOS / OOT)": "CC",
        "Document Reference No.": ref,
        "Title / Description": "Sealing station modification",
        "Format Applicability": "Line-common",
        Status: "Closed",
        "Qualification Impact (Y/N)": impact,
      }),
    ]);

  const qualification = (remark: string) =>
    tableDoc([
      [...ELR_QUALIFICATION_HEADERS],
      row(ELR_QUALIFICATION_HEADERS, {
        "Sr. No.": "1",
        "Qualification Stage": "PRQ",
        "Protocol / Report No.": "PRQR-25-PR-060",
        "Format Applicability": "Vial",
        Outcome: "Pass",
        Remarks: remark,
      }),
    ]);

  it("flags a qualification-impacting change with no qualification activity", () => {
    const result = checkQmsQualificationFollowUp(
      ctx(
        { table: cc("Y") },
        {
          section: "elr_qms",
          dependencies: { elr_qualification: { table: qualification("") } },
        }
      )
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/not referenced in the qualification history/i);
  });

  it("passes when the qualification history cites the change control", () => {
    const result = checkQmsQualificationFollowUp(
      ctx(
        { table: cc("Y") },
        {
          section: "elr_qms",
          dependencies: {
            elr_qualification: {
              table: qualification("Triggered by CCF/EU/26/007"),
            },
          },
        }
      )
    );
    expect(result.status).toBe("met");
  });

  it("is satisfied when nothing affects the qualified state", () => {
    const result = checkQmsQualificationFollowUp(
      ctx(
        { table: cc("N") },
        {
          section: "elr_qms",
          dependencies: { elr_qualification: { table: qualification("") } },
        }
      )
    );
    expect(result.status).toBe("met");
  });
});

describe("ELR recommendation", () => {
  it("requires a recommendation to be selected", () => {
    const result = checkRecommendationSelected(
      ctx(
        {
          narrative: narrative("The equipment remains in its qualified state."),
          recommendation: "",
          recommendationNarrative: narrative(""),
        },
        { section: "elr_conclusion" }
      )
    );
    expect(result.status).toBe("not_met");
  });

  it("asks for a specification when Other is chosen", () => {
    const result = checkRecommendationSelected(
      ctx(
        {
          narrative: narrative("The equipment remains in its qualified state."),
          recommendation: "other",
          recommendationNarrative: narrative(""),
        },
        { section: "elr_conclusion" }
      )
    );
    expect(result.status).toBe("partially_met");
    expect(result.reasoning).toMatch(/specify/i);
  });

  it("accepts a selected recommendation with a written conclusion", () => {
    const result = checkRecommendationSelected(
      ctx(
        {
          narrative: narrative("The equipment remains in its qualified state."),
          recommendation: "continue",
          recommendationNarrative: narrative("No action required."),
        },
        { section: "elr_conclusion" }
      )
    );
    expect(result.status).toBe("met");
  });
});

describe("ELR docx template contract", () => {
  function templateTags(): string[] {
    const def = getDocumentType(TYPE);
    const zip = new PizZip(fs.readFileSync(def.export.templatePath));
    const xml = zip.file("word/document.xml")!.asText();
    return [
      ...new Set(
        [...xml.matchAll(/\{(@?[A-Za-z][A-Za-z0-9]*)\}/g)].map((m) =>
          m[1]!.replace(/^@/, "")
        )
      ),
    ].sort();
  }

  function templateDataKeys(): string[] {
    const def = getDocumentType(TYPE);
    const data = def.export.buildTemplateData({
      report: {
        documentNo: "ELR-26-PR-001",
        metadata: {},
      } as unknown as Parameters<typeof def.export.buildTemplateData>[0]["report"],
      sections: ELR_SECTION_KEYS.map((section) => ({
        section,
        content: EMPTY_ELR_CONTENT[section],
      })),
      ctx: undefined,
      comments: [],
    });
    return Object.keys(data).sort();
  }

  it("supplies a value for every placeholder in the template", () => {
    const missing = templateTags().filter(
      (tag) => !templateDataKeys().includes(tag)
    );
    expect(missing).toEqual([]);
  });

  it("has no template data key without a placeholder", () => {
    const tags = templateTags();
    const unused = templateDataKeys().filter((key) => !tags.includes(key));
    expect(unused).toEqual([]);
  });

  it("does not bake in a static table of contents", () => {
    const def = getDocumentType(TYPE);
    const zip = new PizZip(fs.readFileSync(def.export.templatePath));
    const xml = zip.file("word/document.xml")!.asText();
    expect(xml).not.toContain("TABLE OF CONTENTS");
  });
});

describe("ELR pack enablement", () => {
  it("is enabled for MJ and not for demo", () => {
    expect(isDocumentTypeEnabled(TYPE, MJ_PACK)).toBe(true);
    expect(isDocumentTypeEnabled(TYPE, DEMO_PACK)).toBe(false);
  });
});
