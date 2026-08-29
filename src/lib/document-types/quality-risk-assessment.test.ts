import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { DEMO_PACK, MJ_PACK, isDocumentTypeEnabled } from "@/lib/customers/packs";
import { getCriteria, getDocumentType, getWorkspaceSections } from ".";
import type { EvaluationContext } from "./types";
import {
  checkA02Mode,
  checkFmeaScoresRecalculated,
  checkFmeaTablePresent,
  checkMitigationForElevatedRisk,
} from "./qra/deterministic-checks";
import { recalculateFmeaTable } from "./qra/recalculate-table";
import {
  EMPTY_QRA_CONTENT,
  QRA_FMEA_HEADERS,
  QRA_SECTION_KEYS,
  QRA_SECTION_LABELS,
} from "./qra/sections";

const TYPE = "quality_risk_assessment";

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

function fmeaRow(values: Record<string, string>): string[] {
  return [...QRA_FMEA_HEADERS].map((header) => values[header] ?? "");
}

function ctx(
  content: unknown,
  dependencies: Record<string, unknown> = {}
): EvaluationContext {
  return {
    section: "qra_fmea",
    content,
    dependencies,
    report: {} as EvaluationContext["report"],
  };
}

describe("quality risk assessment definition", () => {
  it("exposes F02 sections in report order with qra_ prefixes", () => {
    const sections = getWorkspaceSections(TYPE).map((s) => s.key);
    expect(sections).toEqual([...QRA_SECTION_KEYS]);
    expect(sections.every((key) => key.startsWith("qra_"))).toBe(true);
  });

  it("keeps form numbering out of workspace labels", () => {
    for (const key of QRA_SECTION_KEYS) {
      expect(QRA_SECTION_LABELS[key]).not.toMatch(/^\d/);
    }
  });

  it("seeds empty content for every section", () => {
    for (const key of QRA_SECTION_KEYS) {
      expect(EMPTY_QRA_CONTENT[key]).toBeDefined();
    }
  });

  it("uses the SOP prompt version and FMEA inventory", () => {
    const def = getDocumentType(TYPE);
    expect(def.prompts.promptVersion).toBe("mj-qra-sop-010-r04-v1");
    expect(def.documentNoLabel).toBe("RA Number");
    expect(def.chat.inventorySections).toEqual(["qra_fmea"]);
    expect(def.chat.draftingGuidance).toContain("never write RPN");
    expect(def.export.templatePath).toContain(
      "mj-quality-risk-assessment-template.docx"
    );
    expect(def.suggestTargetFieldPatterns.qra_approach).toEqual([
      "narrative",
      "impactKnown",
      "scopeDefined",
      "scopeNarrow",
    ]);
    expect(def.suggestTargetFieldPatterns.qra_periodic_review).toEqual([
      "narrative",
      "applicable",
    ]);
  });
});

describe("QRA A02 and FMEA checks", () => {
  it("selects qualitative only when every A02 answer is yes", () => {
    const content = {
      impactKnown: "yes",
      scopeDefined: "yes",
      scopeNarrow: "yes",
      assessmentMode: "qualitative",
    };
    expect(checkA02Mode(ctx(content)).status).toBe("met");
    expect(
      checkA02Mode(
        ctx({ ...content, scopeNarrow: "no", assessmentMode: "qualitative" })
      ).status
    ).toBe("not_met");
  });

  it("requires an FMEA table with S/P/D", () => {
    const empty = checkFmeaTablePresent(ctx({ table: tableDoc([QRA_FMEA_HEADERS]) }));
    expect(empty.status).toBe("not_met");

    const filled = checkFmeaTablePresent(
      ctx({
        table: tableDoc([
          QRA_FMEA_HEADERS,
          fmeaRow({
            "Sr. No.": "R01",
            "Process / activity": "Filling",
            "Potential Failure": "Underfill",
            "Severity (S)": "3",
            "Probability (P)": "2",
            "Detectability (D)": "2",
          }),
        ]),
      })
    );
    expect(filled.status).toBe("met");
  });

  it("flags a stale RPN until recalculate writes the SOP value", () => {
    const approach = { assessmentMode: "quantitative" };
    const doc = tableDoc([
      QRA_FMEA_HEADERS,
      fmeaRow({
        "Sr. No.": "R01",
        "Process / activity": "Filling",
        "Potential Failure": "Underfill",
        "Severity (S)": "3",
        "Probability (P)": "2",
        "Detectability (D)": "2",
        "RPN / RPR": "99 (High)",
      }),
    ]);
    const before = checkFmeaScoresRecalculated(
      ctx({ table: doc }, { qra_approach: approach })
    );
    expect(before.status).toBe("not_met");

    const { doc: next } = recalculateFmeaTable(doc, "quantitative");
    const after = checkFmeaScoresRecalculated(
      ctx({ table: next }, { qra_approach: approach })
    );
    expect(after.status).toBe("met");
    expect(JSON.stringify(next)).toContain("12 (Medium)");
  });

  it("requires mitigation for a high quantitative row", () => {
    const approach = { assessmentMode: "quantitative" };
    const result = checkMitigationForElevatedRisk(
      ctx(
        {
          table: tableDoc([
            QRA_FMEA_HEADERS,
            fmeaRow({
              "Sr. No.": "R01",
              "Process / activity": "Sterile fill",
              "Potential Failure": "Contamination",
              "Severity (S)": "5",
              "Probability (P)": "5",
              "Detectability (D)": "5",
            }),
          ]),
        },
        { qra_approach: approach }
      )
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/mitigation/i);
  });
});

describe("QRA criteria wiring", () => {
  it("attaches deterministic score recalculation to the FMEA section", () => {
    const keys = getCriteria(TYPE, "qra_fmea").map((c) => c.key);
    expect(keys).toContain("fmea.scores_recalculated");
    expect(keys).toContain("fmea.mitigation_for_elevated");
  });
});

describe("QRA pack enablement", () => {
  it("is enabled for MJ and not for demo", () => {
    expect(isDocumentTypeEnabled(TYPE, MJ_PACK)).toBe(true);
    expect(isDocumentTypeEnabled(TYPE, DEMO_PACK)).toBe(false);
  });
});
