import fs from "node:fs";
import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { DEMO_PACK, MJ_PACK, isDocumentTypeEnabled } from "@/lib/customers/packs";
import { getCriteria, getDocumentType, getWorkspaceSections } from ".";
import type { EvaluationContext } from "./types";
import {
  checkAccessControlPeriodCompleteness,
  checkAccessControlPrivilegeDrift,
  checkAlarmDirectImpactAction,
  checkAssessmentInterpretsTable,
  checkBreakdownRepeatCapa,
  checkBreakdownRepeatNotIsolated,
  checkCalibrationStatus,
  checkCalibrationValidityNotContradicted,
  checkMonitoringExcursionsLinked,
  checkPreventiveMaintenanceJustified,
  checkPrqScheduleCurrent,
  checkQuantityMathAsProse,
  checkQmsQualificationFollowUp,
  checkQmsRecords,
  checkQualificationFormatScope,
  checkRecommendationSelected,
  checkRecordTypeMatchesReference,
  checkMediaFillTable,
  checkResponsibilitiesTable,
  checkRiskActionRows,
  checkRiskActionsNotBloated,
  checkRiskGradeConsistent,
  checkSystemTrendRows,
  checkSystemTrendsCoverFlaggedFindings,
} from "./elr/deterministic-checks";
import { QUANTITY_MATH_CRITERION_KEY } from "@/lib/math/quantity-math";
import {
  RISK_ACTION_COLUMN_SCHEMA,
  SYSTEM_TRENDS_COLUMN_SCHEMA,
} from "./elr/matrix-columns";
import {
  ELR_ACCESS_CONTROL_HEADERS,
  ELR_ALARM_HEADERS,
  ELR_BREAKDOWN_HEADERS,
  ELR_CALIBRATION_HEADERS,
  ELR_MEDIA_FILL_HEADERS,
  ELR_MONITORING_HEADERS,
  ELR_PREVENTIVE_MAINTENANCE_HEADERS,
  ELR_QMS_HEADERS,
  ELR_QUALIFICATION_HEADERS,
  ELR_RESPONSIBILITIES_HEADERS,
  ELR_RISK_ACTION_HEADERS,
  ELR_RISK_ACTION_MAX_ROWS,
  ELR_SECTION_KEYS,
  ELR_SECTION_LABELS,
  ELR_SYSTEM_TRENDS_HEADERS,
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

function captionedTableDoc(
  rows: readonly (readonly string[])[],
  title = "Monitoring records"
): JSONContent {
  const doc = tableDoc(rows);
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: `Table 1. ${title}` }],
      },
      ...(doc.content ?? []),
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
    // Discrepancy sits after the evidence sections; system trends and risk
    // actions sit between discrepancy and the conclusion.
    expect(sections.indexOf("elr_discrepancies")).toBeGreaterThan(
      sections.indexOf("elr_csv_status")
    );
    expect(sections.indexOf("elr_discrepancies")).toBeLessThan(
      sections.indexOf("elr_system_trends")
    );
    expect(sections.indexOf("elr_system_trends")).toBeLessThan(
      sections.indexOf("elr_risk_actions")
    );
    expect(sections.indexOf("elr_risk_actions")).toBeLessThan(
      sections.indexOf("elr_conclusion")
    );
  });

  it("seeds a starter glossary that no criterion enforces", () => {
    const nodes = EMPTY_ELR_CONTENT.elr_abbreviations.table.content ?? [];
    const table = nodes.find((node) => node.type === "table");
    const caption = nodes.find((node) => node.type === "paragraph");
    const rows = table?.content ?? [];
    expect(caption?.content?.[0]).toMatchObject({
      type: "text",
      text: "Table 1. Abbreviations",
    });
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
    expect(def.chat.inventorySections).toContain("elr_access_control");
    expect(def.chat.inventorySections).toContain("elr_audit_trail");
    expect(def.chat.inventorySections).not.toContain("elr_objective");
    expect(def.chat.inventorySections).not.toContain("elr_scope");
    expect(def.chat.inventorySections).not.toContain("elr_system_trends");
    expect(def.chat.inventorySections).not.toContain("elr_risk_actions");
    expect(def.chat.inventorySections).not.toContain("elr_media_fill");
    expect(def.prompts.promptVersion).toBe("mj-elr-sop-014-r04-v7");
  });

  it("asks which container format when attachments name both and the title page is unset", () => {
    const def = getDocumentType(TYPE);
    expect(def.chat.persona).toContain("both Vial and Cartridge");
    expect(def.chat.persona).toContain("ask_user");
    expect(def.chat.persona).toContain("do not infer it from the first PRQR");
    expect(def.chat.draftingGuidance).toContain(
      "If it is unset and attachments name **both** Vial and Cartridge, stop"
    );
    expect(def.chat.draftingGuidance).toContain("1 April to 31 March");
    expect(def.chat.draftingGuidance).toContain("one row per Grade A / environmental **method**");
    expect(def.chat.draftingGuidance).toContain("ATTACHMENT NO.");
    expect(def.chat.draftingGuidance).toContain("findingsOmitted");
    expect(def.chat.draftingGuidance).toContain("Limits and counts");
    expect(def.chat.draftingGuidance).toContain("<1 CFU/plate");
    expect(def.chat.contextIdentity?.({})).toEqual(
      expect.arrayContaining([
        expect.stringContaining("container format: (unset)"),
      ])
    );
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

  it("requires a source citation on filled media-fill identity cells", () => {
    const table = tableDoc([
      [...ELR_MEDIA_FILL_HEADERS],
      row(ELR_MEDIA_FILL_HEADERS, {
        "Sr. No.": "1",
        "Media Fill No.": "MF-25-VIAL-01",
        "Date": "12 Jan 2024",
        "Units Filled": "10,000",
        "Contaminated Units": "0",
        "Result": "Pass",
      }),
    ]);
    const result = checkMediaFillTable(
      ctx({ table }, { section: "elr_media_fill" })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/no source citation/i);
  });

  it("passes a media-fill row whose sourced cells carry citations", () => {
    const table = tableDoc([
      [...ELR_MEDIA_FILL_HEADERS],
      row(ELR_MEDIA_FILL_HEADERS, {
        "Sr. No.": "1",
        "Media Fill No.": "MF-24-001 [PQR-24-PR-102.pdf, p. 8]",
        "Date": "12 Jan 2024 [PQR-24-PR-102.pdf, p. 8]",
        "Units Filled": "10,000 [1]",
        "Contaminated Units": "0 [1]",
        "Result": "Pass",
      }),
    ]);
    expect(
      checkMediaFillTable(ctx({ table }, { section: "elr_media_fill" })).status
    ).toBe("met");
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

  it("wires synthesis criteria onto the evidence sections they read", () => {
    const trends = getCriteria(TYPE, "elr_system_trends");
    const cover = trends.find((c) => c.key === "system_trends.covers_flagged_findings");
    expect(cover?.kind).toBe("deterministic");
    expect(cover?.dependsOn).toEqual(
      expect.arrayContaining([
        "elr_breakdowns",
        "elr_alarms",
        "elr_monitoring",
        "elr_calibration",
        "elr_preventive_maintenance",
        "elr_qms",
      ])
    );

    const actions = getCriteria(TYPE, "elr_risk_actions");
    const bloated = actions.find((c) => c.key === "risk.not_bloated");
    expect(bloated?.kind).toBe("deterministic");
    expect(bloated?.dependsOn).toEqual(cover?.dependsOn);
    const grade = actions.find((c) => c.key === "risk.grade_consistent");
    expect(grade?.dependsOn).toEqual(
      expect.arrayContaining([...(cover?.dependsOn ?? []), "elr_system_trends"])
    );

    const monitoring = getCriteria(TYPE, "elr_monitoring");
    expect(monitoring.some((c) => c.key === "monitoring.assessment_present")).toBe(
      true
    );
  });

  it("attaches the quantity-math check to every judged section, not the registers", () => {
    for (const key of ELR_SECTION_KEYS) {
      const criteria = getCriteria(TYPE, key);
      if (CRITERIA_FREE_SECTIONS.includes(key)) {
        expect(criteria.some((c) => c.key === QUANTITY_MATH_CRITERION_KEY)).toBe(
          false
        );
        continue;
      }
      const row = criteria.find((c) => c.key === QUANTITY_MATH_CRITERION_KEY);
      expect(row?.kind).toBe("deterministic");
    }
  });
});

describe("ELR quantity math as prose", () => {
  it("fails when Monitoring still has the Word-breaking $<1 CFU/plate$ math atom", () => {
    const result = checkQuantityMathAsProse(
      ctx({
        narrative: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "settle plates " },
                {
                  type: "mathInline",
                  attrs: {
                    latex: String.raw`<1\text{ CFU/plate}`,
                    mathml: "",
                    omml: null,
                    ommlDirty: true,
                  },
                },
              ],
            },
          ],
        },
      })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toContain(String.raw`$<1\text{ CFU/plate}$`);
  });

  it("passes Unicode prose", () => {
    const result = checkQuantityMathAsProse(
      ctx({ narrative: narrative("settle plates <1 CFU/plate on every location") })
    );
    expect(result.status).toBe("met");
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

describe("ELR assessment, trends and risk checks", () => {
  const filledMonitoring = captionedTableDoc([
    [...ELR_MONITORING_HEADERS],
    row(ELR_MONITORING_HEADERS, {
      "Sr. No.": "1",
      "Monitoring Parameter": "Non-viable particle count",
      "Excursion (Y/N)": "Y",
      "Linked Deviation Ref.": "DEV-26-011",
    }),
  ]);

  const repeatBreakdown = {
    table: tableDoc([
      [...ELR_BREAKDOWN_HEADERS],
      row(ELR_BREAKDOWN_HEADERS, {
        "Sr. No.": "1",
        "Component / Failure Description": "Peristaltic pump 3 dosing fault",
        "Repeat (Y/N)": "Y",
      }),
    ]),
  };

  const completeTrend = row(ELR_SYSTEM_TRENDS_HEADERS, {
    "Sr. No.": "1",
    Theme: "Peristaltic pump dosing faults",
    "Where seen (sections / record nos.)": "Breakdowns 3.9; alarm 1951",
    "Occurrences in period": "4",
    "Trend (increasing / stable / decreasing)": "increasing",
    "Product or runtime impact": "Lost runtime on the filling line",
    "Carried to risk (Risk ID)": "R-1",
  });

  const completeAction = (priority: string, serial = "1") =>
    row(ELR_RISK_ACTION_HEADERS, {
      "Sr. No.": serial,
      Risk: "Recurrent peristaltic pump dosing fault",
      "Source (section / records)": "Breakdowns; alarm 1951",
      "Occurrence in period": "4",
      Severity: "High — lost filling runtime",
      "Priority (High / Medium / Low)": priority,
      "Recommended action": "Raise a CAPA to replace the pump tubing set",
      "Action type (CAPA / PM revision / change control / monitoring)": "CAPA",
      Owner: "Engineering",
      "Target date": "2026-10-31",
      Reference: "CAPA-26-014",
    });

  it("keeps system-trend and risk-action headers identical to the column schemas", () => {
    expect(SYSTEM_TRENDS_COLUMN_SCHEMA.map((col) => col.label)).toEqual([
      ...ELR_SYSTEM_TRENDS_HEADERS,
    ]);
    expect(RISK_ACTION_COLUMN_SCHEMA.map((col) => col.label)).toEqual([
      ...ELR_RISK_ACTION_HEADERS,
    ]);
  });

  it("does not require an assessment when the evidence table is empty", () => {
    expect(
      checkAssessmentInterpretsTable(
        ctx(
          { table: tableDoc([[...ELR_MONITORING_HEADERS]]), narrative: narrative("") },
          { section: "elr_monitoring" }
        )
      ).status
    ).toBe("met");
  });

  it("fails a filled evidence table that has no Table N. caption", () => {
    const result = checkAssessmentInterpretsTable(
      ctx(
        {
          table: tableDoc([
            [...ELR_MONITORING_HEADERS],
            row(ELR_MONITORING_HEADERS, {
              "Sr. No.": "1",
              "Monitoring Parameter": "Non-viable particle count",
              "Excursion (Y/N)": "Y",
              "Linked Deviation Ref.": "DEV-26-011",
            }),
          ]),
          narrative: narrative(
            "One of three monitoring parameters recorded an excursion; it was closed under DEV-26-011 with no product impact. The qualified state remains."
          ),
        },
        { section: "elr_monitoring" }
      )
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/Table N/i);
  });

  it("requires a caption and a short summary on a filled responsibilities table", () => {
    const rows = [
      [...ELR_RESPONSIBILITIES_HEADERS],
      row(ELR_RESPONSIBILITIES_HEADERS, {
        "Sr. No.": "1",
        Department: "Production",
        Responsibilities: "Operate the filling line",
      }),
    ];
    const missingBoth = checkResponsibilitiesTable(
      ctx(
        { table: tableDoc(rows), narrative: narrative("") },
        { section: "elr_responsibilities" }
      )
    );
    expect(missingBoth.status).toBe("not_met");
    expect(missingBoth.reasoning).toMatch(/Table N/i);
    expect(missingBoth.reasoning).toMatch(/summary/i);

    const complete = checkResponsibilitiesTable(
      ctx(
        {
          table: captionedTableDoc(
            rows,
            "Departments and responsibilities"
          ),
          narrative: narrative(
            "Production operates the filling line; see Table 1."
          ),
        },
        { section: "elr_responsibilities" }
      )
    );
    expect(complete.status).toBe("met");
  });

  it("fails a filled table with a one-line recap and no count", () => {
    const short = checkAssessmentInterpretsTable(
      ctx(
        { table: filledMonitoring, narrative: narrative("Section reviewed.") },
        { section: "elr_monitoring" }
      )
    );
    expect(short.status).toBe("not_met");
    expect(short.reasoning).toMatch(/one-liner|empty/i);

    const noCount = checkAssessmentInterpretsTable(
      ctx(
        {
          table: filledMonitoring,
          narrative: narrative(
            "Monitoring was reviewed for the period and one excursion was closed with a linked deviation."
          ),
        },
        { section: "elr_monitoring" }
      )
    );
    expect(noCount.status).toBe("not_met");
    expect(noCount.reasoning).toMatch(/count/i);
  });

  it("passes an assessment that states a count from the table", () => {
    const result = checkAssessmentInterpretsTable(
      ctx(
        {
          table: filledMonitoring,
          narrative: narrative(
            "One of three monitoring parameters recorded an excursion; it was closed under DEV-26-011 with no product impact. The qualified state remains."
          ),
        },
        { section: "elr_monitoring" }
      )
    );
    expect(result.status).toBe("met");
  });

  it("requires downtime, scrap, CAPA and qualified-state language when the table carries them", () => {
    const downtimeTable = captionedTableDoc([
      [...ELR_BREAKDOWN_HEADERS],
      row(ELR_BREAKDOWN_HEADERS, {
        "Sr. No.": "1",
        "Component / Failure Description": "Peristaltic pump 3 dosing fault",
        "Downtime (Hrs)": "4.5",
        "Repeat (Y/N)": "N",
      }),
    ]);
    const missingDowntime = checkAssessmentInterpretsTable(
      ctx(
        {
          table: downtimeTable,
          narrative: narrative(
            "1 breakdown occurred on the filling pump and was closed with no product impact this period."
          ),
        },
        { section: "elr_breakdowns" }
      )
    );
    expect(missingDowntime.status).toBe("not_met");
    expect(missingDowntime.reasoning).toMatch(/downtime/i);

    expect(
      checkAssessmentInterpretsTable(
        ctx(
          {
            table: downtimeTable,
            narrative: narrative(
              "One breakdown occurred; 4.5 hours of downtime were recovered with no product impact."
            ),
          },
          { section: "elr_breakdowns" }
        )
      ).status
    ).toBe("met");

    const scrapTable = captionedTableDoc([
      [...ELR_BREAKDOWN_HEADERS],
      row(ELR_BREAKDOWN_HEADERS, {
        "Sr. No.": "1",
        "Component / Failure Description": "Sealing head scored; batch discarded",
        "Format Impact": "Vial scrap",
        "Repeat (Y/N)": "N",
      }),
    ]);
    const missingScrap = checkAssessmentInterpretsTable(
      ctx(
        {
          table: scrapTable,
          narrative: narrative(
            "1 breakdown on the sealing head was closed with no further action this period."
          ),
        },
        { section: "elr_breakdowns" }
      )
    );
    expect(missingScrap.status).toBe("not_met");
    expect(missingScrap.reasoning).toMatch(/scrap/i);

    const capaTable = captionedTableDoc([
      [...ELR_BREAKDOWN_HEADERS],
      row(ELR_BREAKDOWN_HEADERS, {
        "Sr. No.": "1",
        "Component / Failure Description": "Peristaltic pump 3 dosing fault",
        "Repeat (Y/N)": "N",
        "Linked CAPA Ref.": "CAPA-26-014",
      }),
    ]);
    const missingCapa = checkAssessmentInterpretsTable(
      ctx(
        {
          table: capaTable,
          narrative: narrative(
            "1 breakdown on the filling pump was closed with no product impact this period."
          ),
        },
        { section: "elr_breakdowns" }
      )
    );
    expect(missingCapa.status).toBe("not_met");
    expect(missingCapa.reasoning).toMatch(/capa/i);

    const deviationOnly = checkAssessmentInterpretsTable(
      ctx(
        {
          table: filledMonitoring,
          narrative: narrative(
            "One of three monitoring parameters recorded an excursion; it was closed under DEV-26-011 with no product impact."
          ),
        },
        { section: "elr_monitoring" }
      )
    );
    expect(deviationOnly.status).toBe("not_met");
    expect(deviationOnly.reasoning).toMatch(/qualified state/i);
    expect(deviationOnly.reasoning).not.toMatch(/capa/i);
  });

  it("flags an OOT table contradicted by a within-calibration assessment", () => {
    const table = tableDoc([
      [...ELR_CALIBRATION_HEADERS],
      row(ELR_CALIBRATION_HEADERS, {
        "Sr. No.": "1",
        "Instrument ID / Tag": "TI-12",
        "Result (Pass / OOT)": "OOT",
      }),
    ]);
    const result = checkCalibrationValidityNotContradicted(
      ctx(
        {
          table,
          narrative: narrative(
            "All instruments remain within calibration for the period."
          ),
        },
        { section: "elr_calibration" }
      )
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/within calibration/i);
  });

  it("flags a repeat breakdown described as isolated", () => {
    const result = checkBreakdownRepeatNotIsolated(
      ctx(
        {
          ...repeatBreakdown,
          narrative: narrative(
            "This was an isolated, one-off pump fault with no recurrence."
          ),
        },
        { section: "elr_breakdowns" }
      )
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/isolated/i);
  });

  it("flags privilege grants described as unchanged", () => {
    const table = tableDoc([
      [...ELR_ACCESS_CONTROL_HEADERS],
      row(ELR_ACCESS_CONTROL_HEADERS, {
        "Sr. No.": "1",
        "System Name / ID": "SCADA",
        "Role / Privilege Level": "Level 3",
        "Action (Granted / Modified / Revoked)": "Granted",
      }),
    ]);
    const result = checkAccessControlPrivilegeDrift(
      ctx(
        {
          table,
          narrative: narrative("Access privileges are unchanged this period."),
        },
        { section: "elr_access_control" }
      )
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/unchanged/i);
  });

  it("requires last review, admin recertification and Part 11 on access control", () => {
    const table = tableDoc([
      [...ELR_ACCESS_CONTROL_HEADERS],
      row(ELR_ACCESS_CONTROL_HEADERS, {
        "Sr. No.": "1",
        "System Name / ID": "SCADA",
        "Role / Privilege Level": "Level 4 administrator",
        "Action (Granted / Modified / Revoked)": "Modified",
      }),
    ]);
    const incomplete = checkAccessControlPeriodCompleteness(
      ctx(
        {
          table,
          narrative: narrative("Two users are listed on the SCADA system."),
        },
        { section: "elr_access_control" }
      )
    );
    expect(incomplete.status).toBe("not_met");
    expect(incomplete.reasoning).toMatch(/last reviewed|Part 11|recertif/i);

    expect(
      checkAccessControlPeriodCompleteness(
        ctx(
          {
            table,
            narrative: narrative(
              "Last reviewed 12-Mar-2026. Level 4 admin holders were recertified. 21 CFR Part 11 access, audit-trail and authority checks remain in force."
            ),
          },
          { section: "elr_access_control" }
        )
      ).status
    ).toBe("met");
  });

  it("flags a CAPA-typed QMS row that cites a deviation number", () => {
    const table = tableDoc([
      [...ELR_QMS_HEADERS],
      row(ELR_QMS_HEADERS, {
        "Sr. No.": "1",
        "Type (CC / Dev / CAPA / OOS / OOT)": "CAPA",
        "Document Reference No.": "DEV-26-011",
        Status: "Closed",
        "Qualification Impact (Y/N)": "N",
      }),
    ]);
    const result = checkRecordTypeMatchesReference(
      ctx({ table }, { section: "elr_qms" })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/capa/i);
    expect(result.reasoning).toMatch(/deviation/i);
  });

  it("requires theme, where-seen, occurrences and impact on each trend row", () => {
    const incomplete = tableDoc([
      [...ELR_SYSTEM_TRENDS_HEADERS],
      row(ELR_SYSTEM_TRENDS_HEADERS, {
        "Sr. No.": "1",
        Theme: "Peristaltic pump dosing faults",
      }),
    ]);
    const result = checkSystemTrendRows(
      ctx({ table: incomplete }, { section: "elr_system_trends" })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/where the theme was seen/i);
  });

  it("fails an empty trends table when a repeat breakdown is flagged", () => {
    const result = checkSystemTrendsCoverFlaggedFindings(
      ctx(
        { table: tableDoc([[...ELR_SYSTEM_TRENDS_HEADERS]]) },
        {
          section: "elr_system_trends",
          dependencies: { elr_breakdowns: repeatBreakdown },
        }
      )
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/repeat breakdown/i);
  });

  it("passes a complete trend row against flagged findings", () => {
    const table = tableDoc([[...ELR_SYSTEM_TRENDS_HEADERS], completeTrend]);
    expect(
      checkSystemTrendRows(ctx({ table }, { section: "elr_system_trends" })).status
    ).toBe("met");
    expect(
      checkSystemTrendsCoverFlaggedFindings(
        ctx(
          { table },
          {
            section: "elr_system_trends",
            dependencies: { elr_breakdowns: repeatBreakdown },
          }
        )
      ).status
    ).toBe("met");
  });

  it("rejects a High-priority action with overall grade Low", () => {
    const result = checkRiskGradeConsistent(
      ctx(
        {
          overallGrade: "low",
          table: tableDoc([[...ELR_RISK_ACTION_HEADERS], completeAction("High")]),
        },
        { section: "elr_risk_actions" }
      )
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/cannot be Low/i);
  });

  it("accepts a High-priority action with overall grade High", () => {
    expect(
      checkRiskGradeConsistent(
        ctx(
          {
            overallGrade: "high",
            table: tableDoc([[...ELR_RISK_ACTION_HEADERS], completeAction("High")]),
          },
          { section: "elr_risk_actions" }
        )
      ).status
    ).toBe("met");
  });

  it("floors overall grade from downtime, scrap and increasing high-impact themes", () => {
    const eightHours = {
      table: tableDoc([
        [...ELR_BREAKDOWN_HEADERS],
        row(ELR_BREAKDOWN_HEADERS, {
          "Sr. No.": "1",
          "Component / Failure Description": "Peristaltic pump 3 dosing fault",
          "Downtime (Hrs)": "8",
          "Repeat (Y/N)": "N",
        }),
      ]),
    };
    const emptyActions = tableDoc([[...ELR_RISK_ACTION_HEADERS]]);
    const highFloor = checkRiskGradeConsistent(
      ctx(
        { overallGrade: "medium", table: emptyActions },
        {
          section: "elr_risk_actions",
          dependencies: { elr_breakdowns: eightHours },
        }
      )
    );
    expect(highFloor.status).toBe("not_met");
    expect(highFloor.reasoning).toMatch(/floor \(high\)/i);

    const twoHours = {
      table: tableDoc([
        [...ELR_BREAKDOWN_HEADERS],
        row(ELR_BREAKDOWN_HEADERS, {
          "Sr. No.": "1",
          "Component / Failure Description": "Peristaltic pump 3 dosing fault",
          "Downtime (Hrs)": "2",
          "Repeat (Y/N)": "N",
        }),
      ]),
    };
    const mediumFloor = checkRiskGradeConsistent(
      ctx(
        { overallGrade: "low", table: emptyActions },
        {
          section: "elr_risk_actions",
          dependencies: { elr_breakdowns: twoHours },
        }
      )
    );
    expect(mediumFloor.status).toBe("not_met");
    expect(mediumFloor.reasoning).toMatch(/floor \(medium\)/i);

    const increasing = {
      table: tableDoc([
        [...ELR_SYSTEM_TRENDS_HEADERS],
        row(ELR_SYSTEM_TRENDS_HEADERS, {
          "Sr. No.": "1",
          Theme: "Peristaltic pump dosing faults",
          "Trend (increasing / stable / decreasing)": "increasing",
          "Product or runtime impact": "Lost runtime on the filling line",
        }),
      ]),
    };
    const themeFloor = checkRiskGradeConsistent(
      ctx(
        { overallGrade: "low", table: emptyActions },
        {
          section: "elr_risk_actions",
          dependencies: { elr_system_trends: increasing },
        }
      )
    );
    expect(themeFloor.status).toBe("not_met");
    expect(themeFloor.reasoning).toMatch(/floor \(medium\)/i);

    expect(
      checkRiskGradeConsistent(
        ctx(
          { overallGrade: "high", table: emptyActions },
          {
            section: "elr_risk_actions",
            dependencies: { elr_breakdowns: eightHours },
          }
        )
      ).status
    ).toBe("met");
  });

  it("requires owner, date and High/Medium/Low on each risk row", () => {
    const incomplete = tableDoc([
      [...ELR_RISK_ACTION_HEADERS],
      row(ELR_RISK_ACTION_HEADERS, {
        "Sr. No.": "1",
        Risk: "Recurrent peristaltic pump dosing fault",
        "Source (section / records)": "Breakdowns",
        "Occurrence in period": "4",
        Severity: "High",
        "Priority (High / Medium / Low)": "urgent",
        "Recommended action": "Replace the pump",
      }),
    ]);
    const result = checkRiskActionRows(
      ctx({ table: incomplete }, { section: "elr_risk_actions" })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/High, Medium or Low/i);
  });

  it("fails an empty action list when flagged findings exist", () => {
    const result = checkRiskActionsNotBloated(
      ctx(
        { table: tableDoc([[...ELR_RISK_ACTION_HEADERS]]) },
        {
          section: "elr_risk_actions",
          dependencies: { elr_breakdowns: repeatBreakdown },
        }
      )
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/no recommended actions/i);
  });

  it("marks more than 15 risk rows as partially met", () => {
    const rows = Array.from({ length: ELR_RISK_ACTION_MAX_ROWS + 1 }, (_, i) =>
      completeAction("Medium", String(i + 1))
    );
    const result = checkRiskActionsNotBloated(
      ctx(
        { table: tableDoc([[...ELR_RISK_ACTION_HEADERS], ...rows]) },
        { section: "elr_risk_actions" }
      )
    );
    expect(result.status).toBe("partially_met");
    expect(result.reasoning).toMatch(/consolidate/i);
  });

  it("hydrates a missing overallGrade on merge without dropping the table", () => {
    const merged = getDocumentType(TYPE).mergeSection("elr_risk_actions", {
      narrative: narrative("High because of lost runtime."),
      table: tableDoc([[...ELR_RISK_ACTION_HEADERS], completeAction("High")]),
    });
    expect(merged).toMatchObject({ overallGrade: "" });
    expect(
      checkRiskGradeConsistent(
        ctx(merged, { section: "elr_risk_actions" })
      ).status
    ).toBe("not_met");
  });
});
