import fs from "node:fs";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import type { DocumentType } from "@/db/schema";
import { getDocumentType } from "./index";
import type { EvaluationContext } from "./types";
import {
  EMPTY_FIR_CONTENT,
  FIR_ACTION_HEADERS,
  FIR_CAPA_EFFECTIVENESS_HEADERS,
  FIR_HISTORIC_REVIEW_HEADERS,
  FIR_SECTION_KEYS,
  type FirSectionKey,
} from "./fir/sections";
import {
  checkActionsOwnedAndDated,
  checkBatchDisposition,
  checkCapaEffectiveness,
  checkHistoricReview,
  checkHumanErrorEvaluation,
  checkImpactAssessmentResultsStatus,
  checkInitialImpactPresent,
  checkInterimControl,
  checkInvestigationTools,
  checkRecurrenceAddressed,
  checkRootCauseClassified,
} from "./fir/deterministic-checks";

const TYPE: DocumentType = "failure_investigation_report";

// ------------------------------------------------------------------ helpers

function doc(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function table(headers: readonly string[], rows: readonly string[][]) {
  const row = (cells: readonly string[], header = false) => ({
    type: "tableRow",
    content: cells.map((text) => ({
      type: header ? "tableHeader" : "tableCell",
      content: [
        { type: "paragraph", content: text ? [{ type: "text", text }] : [] },
      ],
    })),
  });
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [row(headers, true), ...rows.map((r) => row(r))],
      },
    ],
  };
}

function ctx(
  content: unknown,
  dependencies: Record<string, unknown> = {}
): EvaluationContext {
  return {
    section: "fir_root_cause" as EvaluationContext["section"],
    content,
    dependencies,
    report: { metadata: {} } as EvaluationContext["report"],
  };
}

// ---------------------------------------------------------------- structure

describe("failure investigation report definition", () => {
  it("is registered and separate from the DP investigation report", () => {
    const def = getDocumentType(TYPE);
    expect(def.key).toBe(TYPE);
    expect(def.label).toBe("Investigation Report DS");

    const dmaic = getDocumentType("investigation_report");
    expect(def.export.templatePath).not.toBe(dmaic.export.templatePath);
    expect(def.prompts.promptVersion).not.toBe(dmaic.prompts.promptVersion);
  });

  it("has no DMAIC sections", () => {
    const keys = getDocumentType(TYPE).sections.map((s) => s.key);
    for (const dmaic of ["define", "measure", "analyze", "improve", "control"]) {
      expect(keys).not.toContain(dmaic);
    }
  });

  it("carries the R01 fields the DMAIC form has no home for", () => {
    const keys = getDocumentType(TYPE).sections.map((s) => s.key);
    expect(keys).toContain("fir_initial_impact");
    expect(keys).toContain("fir_batch_disposition");
    expect(keys).toContain("fir_interim_control");
    expect(keys).toContain("fir_capa_effectiveness");
    expect(keys).toContain("fir_human_error");
  });

  it("gives every section at least one criterion", () => {
    const def = getDocumentType(TYPE);
    for (const key of FIR_SECTION_KEYS) {
      expect(def.criteriaBySection[key]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("wires a check function to every deterministic criterion", () => {
    const def = getDocumentType(TYPE);
    for (const criteria of Object.values(def.criteriaBySection)) {
      for (const criterion of criteria) {
        if (criterion.kind === "deterministic") {
          expect(typeof criterion.check).toBe("function");
        }
      }
    }
  });

  it("declares dependsOn for every cross-section check", () => {
    const def = getDocumentType(TYPE);
    const byKey = Object.fromEntries(
      Object.values(def.criteriaBySection)
        .flat()
        .map((c) => [c.key, c])
    );
    expect(byKey["human_error.answered"]?.dependsOn).toContain("fir_root_cause");
    expect(byKey["interim.covers_open_actions"]?.dependsOn).toEqual([
      "fir_corrective_action",
      "fir_preventive_action",
    ]);
    expect(byKey["effectiveness.defined"]?.dependsOn).toEqual([
      "fir_corrective_action",
      "fir_preventive_action",
    ]);
  });
});

// ----------------------------------------------------------------- checks

describe("FIR initial impact", () => {
  it("fails when the field the old form omitted is empty", () => {
    expect(checkInitialImpactPresent(ctx(EMPTY_FIR_CONTENT.fir_initial_impact)).status).toBe(
      "not_met"
    );
  });

  it("passes when the event-time assessment is recorded", () => {
    const content = {
      narrative: doc(
        "At the time the event was raised, product, process and equipment impact were assessed as unknown pending trend review."
      ),
    };
    expect(checkInitialImpactPresent(ctx(content)).status).toBe("met");
  });
});

describe("FIR investigation tools", () => {
  it("rejects a tool that is not on the R01 form", () => {
    // ERF/26/022 wrote "Documents review and Why-Why Analysis".
    const result = checkInvestigationTools(
      ctx({ tools: ["documents_review"], otherTools: "", narrative: doc("") })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toContain("documents_review");
  });

  it("requires at least one selection", () => {
    expect(
      checkInvestigationTools(ctx(EMPTY_FIR_CONTENT.fir_investigation_tools))
        .status
    ).toBe("not_met");
  });

  it("passes on a form selection", () => {
    expect(
      checkInvestigationTools(
        ctx({ tools: ["five_why", "six_m"], otherTools: "", narrative: doc("") })
      ).status
    ).toBe("met");
  });
});

describe("FIR root cause classification", () => {
  it("fails when classification and group are unset", () => {
    const result = checkRootCauseClassified(
      ctx(EMPTY_FIR_CONTENT.fir_root_cause)
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toContain("Root Cause Classification");
  });

  it("flags No Root Cause combined with a 6M group", () => {
    const result = checkRootCauseClassified(
      ctx({
        classification: "no_root_cause",
        groups: ["machine"],
        narrative: doc(
          "The vacuum control system relies on a manually operated needle valve for fine chamber-pressure adjustment."
        ),
      })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toContain("No Root Cause");
  });

  it("passes on a classified machine cause", () => {
    const result = checkRootCauseClassified(
      ctx({
        classification: "root_cause",
        groups: ["machine"],
        narrative: doc(
          "The vacuum control system relies on a manually operated needle valve for fine chamber-pressure adjustment during the transition into Primary Drying Step 1."
        ),
      })
    );
    expect(result.status).toBe("met");
  });
});

describe("FIR human error evaluation", () => {
  it("fails when left blank rather than marked NA", () => {
    expect(
      checkHumanErrorEvaluation(ctx(EMPTY_FIR_CONTENT.fir_human_error)).status
    ).toBe("not_met");
  });

  it("accepts an explicit not-applicable", () => {
    const result = checkHumanErrorEvaluation(
      ctx(
        { applicable: "no", table: EMPTY_FIR_CONTENT.fir_human_error.table },
        { fir_root_cause: { classification: "root_cause", groups: ["machine"] } }
      )
    );
    expect(result.status).toBe("met");
  });

  it("requires the evaluation when the root cause group includes Man", () => {
    const result = checkHumanErrorEvaluation(
      ctx(
        { applicable: "no", table: EMPTY_FIR_CONTENT.fir_human_error.table },
        { fir_root_cause: { classification: "root_cause", groups: ["man"] } }
      )
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toContain("Man");
  });
});

describe("FIR historic review", () => {
  it("fails when the R01 columns are replaced with an ad-hoc layout", () => {
    const content = {
      narrative: doc("Three prior events were reviewed."),
      table: table(
        ["Sr.No", "Event Description", "Root Cause", "Corrective Action"],
        [["1", "ERF/25/135 vacuum excursion", "Needle valve position", "Replaced valve"]]
      ),
    };
    const result = checkHistoricReview(ctx(content));
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/Date|Batch No/);
  });

  it("passes on the prescribed columns", () => {
    const content = {
      narrative: doc(
        "Three prior vacuum events were reviewed and their CAPAs confirmed implemented."
      ),
      table: table(FIR_HISTORIC_REVIEW_HEADERS, [
        [
          "1",
          "24/10/2025",
          "ERF/25/135",
          "RIG25008",
          "Vacuum excursion in primary drying",
          "Improper needle valve positioning",
          "Valve replaced; dual sign-off added",
        ],
      ]),
    };
    expect(checkHistoricReview(ctx(content)).status).toBe("met");
  });

  it("requires recurrence to be addressed when prior events exist", () => {
    const content = {
      narrative: doc("Three prior vacuum events were listed for reference."),
      table: table(FIR_HISTORIC_REVIEW_HEADERS, [
        ["1", "24/10/2025", "ERF/25/135", "RIG25008", "Excursion", "Valve", "Replaced"],
      ]),
    };
    const result = checkRecurrenceAddressed(ctx(content));
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toContain("recurrence");
  });

  it("accepts an inference that names CAPA effectiveness", () => {
    const content = {
      narrative: doc(
        "The previously implemented CAPAs are not considered fully effective in mitigating the manual vacuum-control risk."
      ),
      table: table(FIR_HISTORIC_REVIEW_HEADERS, [
        ["1", "24/10/2025", "ERF/25/135", "RIG25008", "Excursion", "Valve", "Replaced"],
      ]),
    };
    expect(checkRecurrenceAddressed(ctx(content)).status).toBe("met");
  });
});

describe("FIR impact assessment results status", () => {
  const pendingNarrative = doc(
    "All reported results were within their specified acceptance limits. Host Cell DNA is under testing."
  );

  it("requires the status to be recorded", () => {
    const result = checkImpactAssessmentResultsStatus(
      ctx({ resultsStatus: "", narrative: pendingNarrative })
    );
    expect(result.status).toBe("not_met");
  });

  it("catches a final conclusion resting on testing in progress", () => {
    const result = checkImpactAssessmentResultsStatus(
      ctx({ resultsStatus: "final", narrative: pendingNarrative })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toContain("under testing");
  });

  it("accepts the same narrative when marked interim", () => {
    const result = checkImpactAssessmentResultsStatus(
      ctx({ resultsStatus: "interim", narrative: pendingNarrative })
    );
    expect(result.status).toBe("met");
  });
});

describe("FIR batch disposition", () => {
  it("fails when the field is absent, as it was in ERF/26/022", () => {
    expect(
      checkBatchDisposition(ctx(EMPTY_FIR_CONTENT.fir_batch_disposition)).status
    ).toBe("not_met");
  });

  it("requires justification for a non-NA disposition", () => {
    expect(
      checkBatchDisposition(ctx({ disposition: "approved", narrative: doc("") }))
        .status
    ).toBe("not_met");
  });

  it("passes with a disposition and justification", () => {
    const result = checkBatchDisposition(
      ctx({
        disposition: "approved",
        narrative: doc(
          "No adverse impact on product quality was identified; the batch is released."
        ),
      })
    );
    expect(result.status).toBe("met");
    expect(result.reasoning).toContain("Batch Approved");
  });

  it("accepts Not Applicable without justification", () => {
    expect(
      checkBatchDisposition(ctx({ disposition: "na", narrative: doc("") })).status
    ).toBe("met");
  });
});

describe("FIR action ownership", () => {
  function actions(rows: string[][]) {
    return { narrative: doc(""), table: table(FIR_ACTION_HEADERS, rows) };
  }

  it("flags actions with no owner and no date", () => {
    const result = checkActionsOwnedAndDated(
      ctx(actions([["1", "Prepare vacuum control study protocol", "", "", ""]]))
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toContain("responsibility");
    expect(result.reasoning).toContain("target completion date");
  });

  it("rejects a target date that is not a date", () => {
    const result = checkActionsOwnedAndDated(
      ctx(
        actions([
          ["1", "Prepare study protocol", "Engineering", "as required", ""],
        ])
      )
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toContain("not a date");
  });

  it("passes when every action is owned and dated", () => {
    const result = checkActionsOwnedAndDated(
      ctx(
        actions([
          ["1", "Prepare study protocol", "Engineering", "31/10/2026", "CC/26/014"],
          ["2", "Revise BMR section 7.16.31", "QA", "15/11/2026", "CC/26/015"],
        ])
      )
    );
    expect(result.status).toBe("met");
  });
});

describe("FIR interim control", () => {
  const openCorrective = {
    narrative: doc(""),
    table: table(FIR_ACTION_HEADERS, [
      ["1", "Revise BMR", "QA", "15/11/2026", ""],
    ]),
  };

  it("requires an interim control while actions are open", () => {
    const result = checkInterimControl(
      ctx(EMPTY_FIR_CONTENT.fir_interim_control, {
        fir_corrective_action: openCorrective,
        fir_preventive_action: EMPTY_FIR_CONTENT.fir_preventive_action,
      })
    );
    expect(result.status).toBe("not_met");
  });

  it("passes when nothing is open", () => {
    const result = checkInterimControl(
      ctx(EMPTY_FIR_CONTENT.fir_interim_control, {
        fir_corrective_action: EMPTY_FIR_CONTENT.fir_corrective_action,
        fir_preventive_action: EMPTY_FIR_CONTENT.fir_preventive_action,
      })
    );
    expect(result.status).toBe("met");
  });
});

describe("FIR CAPA effectiveness check", () => {
  const withActions = {
    fir_corrective_action: {
      narrative: doc(""),
      table: table(FIR_ACTION_HEADERS, [
        ["1", "Revise BMR", "QA", "15/11/2026", ""],
      ]),
    },
    fir_preventive_action: EMPTY_FIR_CONTENT.fir_preventive_action,
  };

  it("fails when CAPA exists but no check is defined", () => {
    const result = checkCapaEffectiveness(
      ctx(EMPTY_FIR_CONTENT.fir_capa_effectiveness, withActions)
    );
    expect(result.status).toBe("not_met");
  });

  it("requires a criterion and a duration on each row", () => {
    const content = {
      table: table(FIR_CAPA_EFFECTIVENESS_HEADERS, [
        ["1", "Monitor the vacuum trend", "", "", "Engineering", ""],
      ]),
    };
    const result = checkCapaEffectiveness(ctx(content, withActions));
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toContain("acceptance criteria");
    expect(result.reasoning).toContain("duration");
  });

  it("passes on a specific check", () => {
    const content = {
      table: table(FIR_CAPA_EFFECTIVENESS_HEADERS, [
        [
          "1",
          "Review Step-1 vacuum trends",
          "No excursion beyond the 20-minute stabilization window",
          "Next 10 batches / 6 months",
          "Engineering",
          "",
        ],
      ]),
    };
    expect(checkCapaEffectiveness(ctx(content, withActions)).status).toBe("met");
  });

  it("passes when there is no CAPA to check", () => {
    const result = checkCapaEffectiveness(
      ctx(EMPTY_FIR_CONTENT.fir_capa_effectiveness, {
        fir_corrective_action: EMPTY_FIR_CONTENT.fir_corrective_action,
        fir_preventive_action: EMPTY_FIR_CONTENT.fir_preventive_action,
      })
    );
    expect(result.status).toBe("met");
  });
});

// -------------------------------------------------------- template contract

describe("FIR docx template contract", () => {
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
        documentNo: "ERF/26/022",
        metadata: {},
      } as unknown as Parameters<typeof def.export.buildTemplateData>[0]["report"],
      sections: FIR_SECTION_KEYS.map((section: FirSectionKey) => ({
        section,
        content: EMPTY_FIR_CONTENT[section],
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

  it("prints the R01 form and SOP references, not the DP form", () => {
    const def = getDocumentType(TYPE);
    const zip = new PizZip(fs.readFileSync(def.export.templatePath));
    const body = zip.file("word/document.xml")!.asText();
    const footer = zip.file("word/footer1.xml")!.asText();
    const header = zip.file("word/header2.xml")!.asText();

    expect(body).toContain("Initial Impact Assessment");
    expect(body).toContain("Batch Disposition");
    expect(body).toContain("CAPA Effectiveness Check");
    expect(body).not.toContain("6 M Method");
    expect(body).not.toContain("5 Why Approach");
    expect(footer).toContain("/QA/017-F01/R01");
    expect(header).toContain("SOP/QA/017");
    // The unit meta row is what separates DS from DP on paper.
    expect(header).toContain("Unit: Drug Substance");
    expect(header).not.toContain("SOP/DP/QA/008");
  });

  it("keeps the MJ logo from the source template", () => {
    const def = getDocumentType(TYPE);
    const zip = new PizZip(fs.readFileSync(def.export.templatePath));
    expect(zip.file("word/media/image1.png")).toBeTruthy();
  });

  it("renders checkbox rows for every fixed list", () => {
    const def = getDocumentType(TYPE);
    const data = def.export.buildTemplateData({
      report: {
        documentNo: "ERF/26/022",
        metadata: {},
      } as unknown as Parameters<typeof def.export.buildTemplateData>[0]["report"],
      sections: [
        {
          section: "fir_root_cause",
          content: {
            classification: "root_cause",
            groups: ["machine"],
            narrative: doc(""),
          },
        },
        {
          section: "fir_batch_disposition",
          content: { disposition: "approved", narrative: doc("") },
        },
      ],
      ctx: undefined,
      comments: [],
    }) as Record<string, string>;

    expect(data.rootCauseClassificationCheckboxes).toContain("☒ Root Cause");
    expect(data.rootCauseClassificationCheckboxes).toContain("☐ Assignable Cause");
    expect(data.rootCauseGroupCheckboxes).toContain("☒ Machine");
    expect(data.batchDispositionCheckboxes).toContain("☒ Batch Approved");
  });
});
