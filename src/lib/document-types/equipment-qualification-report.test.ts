import { describe, expect, it } from "vitest";
import { getDocumentType } from "@/lib/document-types";
import { isFixedColumnTable } from "@/lib/suggestions/table-operation";
import { displaySectionLabel } from "@/types/sections";
import type { EvaluationContext } from "./types";
import {
  EMPTY_EQR_CONTENT,
  EQR_FIELDS,
  EQR_SECTION_KEYS,
  EQR_SECTION_LABELS,
  checkProsePresent,
  checkTablesFilled,
  isEqrTableField,
} from "./eqr/sections";

const ctx = (section: string, content: unknown) =>
  ({ section, content, dependencies: {}, report: {} }) as unknown as EvaluationContext;

const hasTable = (doc: unknown) => JSON.stringify(doc).includes('"type":"table"');

describe("equipment qualification report", () => {
  const def = getDocumentType("equipment_qualification_report");

  it("gives every section its own editable boxes in IQ / OQ / PQ order", () => {
    expect(def.sections.map((s) => s.key)).toEqual([...EQR_SECTION_KEYS]);
    expect(def.sections.every((s) => s.editable && !s.virtual)).toBe(true);
    const order = def.sections.map((s) => s.label);
    expect(order.indexOf("Installation Qualification (IQ)")).toBeLessThan(order.indexOf("Operational Qualification (OQ)"));
    expect(order.indexOf("Operational Qualification (OQ)")).toBeLessThan(order.indexOf("Performance Qualification (PQ)"));
    expect(def.suggestionApplyMode ?? "final").toBe("final");
    expect(def.evaluation).toEqual({ kind: "criteria" });
  });

  it("keeps prose and tables in separate boxes", () => {
    for (const key of EQR_SECTION_KEYS) {
      for (const field of EQR_FIELDS[key]) {
        const seeded = EMPTY_EQR_CONTENT[key][field.key];
        expect(hasTable(seeded)).toBe(field.kind === "table");
        expect(isEqrTableField(key, field.key)).toBe(field.kind === "table");
      }
      expect(def.richFieldPaths[key]).toEqual(EQR_FIELDS[key].map((f) => f.key));
      expect(def.suggestTargetFieldPatterns[key]).toEqual(EQR_FIELDS[key].map((f) => f.key));
    }
    expect(EQR_FIELDS.eqr_approach.map((f) => f.key)).toEqual(["narrative", "parameters", "attributes"]);
    expect(EQR_FIELDS.eqr_oq.map((f) => f.key)).toEqual(["narrative", "table", "instruments", "processWindow"]);
  });

  it("treats every EQR table box as a fixed-schema matrix (header row protected)", () => {
    expect(isFixedColumnTable("eqr_oq", "processWindow")).toBe(true);
    expect(isFixedColumnTable("eqr_approach", "parameters")).toBe(true);
    expect(isFixedColumnTable("eqr_oq", "narrative")).toBe(false);
  });

  describe("OQ instrument calibration check", () => {
    const criterion = def.criteriaBySection.eqr_oq.find((c) => c.key === "oq.calibration")!;
    const para = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
    const instruments = (rows: string[][]) => {
      const seeded = EMPTY_EQR_CONTENT.eqr_oq.instruments;
      const header = seeded.content![0].content![0];
      const cell = (text: string) => ({ type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] });
      return { type: "doc", content: [{ type: "table", content: [header, ...rows.map((r) => ({ type: "tableRow", content: r.map(cell) }))] }] };
    };
    const oq = (rows: string[][]) => ({
      ...EMPTY_EQR_CONTENT.eqr_oq,
      narrative: para("OQ was executed from 2026-09-02 to 2026-09-03 per protocol EQP-2026-014."),
      instruments: instruments(rows),
    });
    const run = (content: unknown, deviations = "") =>
      criterion.check!({
        section: "eqr_oq",
        content,
        // Shaped like the real dependency: the Deviations section with its boxes.
        dependencies: { eqr_deviations: { ...EMPTY_EQR_CONTENT.eqr_deviations, narrative: para(deviations) } },
        report: {},
      } as unknown as EvaluationContext);

    it("is deterministic and reads Deviations", () => {
      expect(criterion.kind).toBe("deterministic");
      expect(criterion.dependsOn).toEqual(["eqr_deviations"]);
    });

    it("fails an instrument past its due date with no deviation", () => {
      const v = run(oq([["TC-REF-114 [1]", "Reference thermocouple", "OQ-01, OQ-02", "2026-08-31 [2]"], ["LC-22", "Load cell", "OQ-04", "2027-03-15"]]));
      expect(v.status).toBe("not_met");
      expect(v.reasoning).toContain("TC-REF-114 (due 2026-08-31)");
      expect(v.reasoning).not.toContain("LC-22");
    });

    it("passes once the Deviation log table records the expired instrument", () => {
      const log = instruments([["DEV-HB-26-003", "OQ-01/02", "TC-REF-114 past calibration", "Repeat OQ-01/02"]]);
      const v = criterion.check!({
        section: "eqr_oq",
        content: oq([["TC-REF-114", "Reference thermocouple", "OQ-01, OQ-02", "2026-08-31"]]),
        dependencies: { eqr_deviations: { ...EMPTY_EQR_CONTENT.eqr_deviations, table: log } },
        report: {},
      } as unknown as EvaluationContext);
      expect(v.status).toBe("met");
    });

    it("passes once Deviations records the expired instrument", () => {
      const v = run(oq([["TC-REF-114", "Reference thermocouple", "OQ-01, OQ-02", "2026-08-31"]]), "DEV-HB-26-003: TC-REF-114 calibration expired before OQ.");
      expect(v.status).toBe("met");
      expect(v.reasoning).toContain("recorded in Deviations");
    });

    it("passes when every instrument was in calibration", () => {
      expect(run(oq([["LC-22", "Load cell", "OQ-04", "2027-03-15"]])).status).toBe("met");
    });

    it("reads the execution date from the instrument row when the OQ write-up has none", () => {
      const content = { ...EMPTY_EQR_CONTENT.eqr_oq, instruments: instruments([["TC-REF-114", "Reference thermocouple", "OQ-01, OQ-02", "2026-08-31 (expired before OQ execution on 2026-09-02)"]]) };
      expect(run(content).status).toBe("not_met");
    });

    it("understands written-out dates", () => {
      const content = { ...oq([["TC-REF-114", "Reference thermocouple", "OQ-01", "31 August 2026"]]), narrative: para("OQ ran on September 2, 2026 and 3 Sep 2026.") };
      expect(run(content).reasoning).toContain("through 2026-09-03");
    });

    it("asks for the instruments when none are listed", () => {
      expect(run(EMPTY_EQR_CONTENT.eqr_oq).status).toBe("not_met");
    });
  });

  it("merge keeps a stored box and falls back to the seed only when missing", () => {
    const seeded = def.mergeSection("eqr_equipment", undefined);
    expect(JSON.stringify(seeded)).toContain("Serial number");
    const cleared = def.mergeSection("eqr_equipment", { table: { type: "doc", content: [{ type: "paragraph" }] } });
    expect(JSON.stringify(cleared)).not.toContain("Serial number");
    const partial = def.mergeSection("eqr_oq", { narrative: { type: "doc", content: [{ type: "paragraph" }] } }) as Record<string, unknown>;
    expect(hasTable(partial.processWindow)).toBe(true);
  });

  it("deterministic checks read prose boxes and table boxes", () => {
    expect(checkProsePresent(ctx("eqr_iq", EMPTY_EQR_CONTENT.eqr_iq)).status).toBe("not_met");
    expect(checkTablesFilled(ctx("eqr_equipment", EMPTY_EQR_CONTENT.eqr_equipment)).status).toBe("partially_met");
    expect(checkTablesFilled(ctx("eqr_iq", EMPTY_EQR_CONTENT.eqr_iq)).status).toBe("not_met");
    const written = {
      ...EMPTY_EQR_CONTENT.eqr_iq,
      narrative: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Nine installation checks were executed on 2026-08-26 and all passed." }] }],
      },
    };
    expect(checkProsePresent(ctx("eqr_iq", written)).status).toBe("met");
  });

  it("shows the registry label wherever a section is named", () => {
    for (const key of EQR_SECTION_KEYS) expect(displaySectionLabel(key)).toBe(EQR_SECTION_LABELS[key]);
  });
});
