import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONVERGENT_CHECK_POLICY,
  CONVERGENT_PROTOCOL_CONFIG,
} from "@/lib/customers/convergent/protocol-config";
import { buildLedger } from "@/lib/design-inputs/build-ledger";
import { runAllChecks } from "@/lib/design-inputs/checks";
import { EXPECTED } from "@/lib/design-inputs/expected-findings";
import {
  readPlanFixture,
  readProtocolFixture,
  readSrsFixture,
} from "@/lib/design-inputs/read-fixtures";
import type { EvaluationContext } from "./types";
import { verificationProtocolDefinition } from "./verification-protocol";
import type { ReportRecord } from "@/types/report";

const PRODUCT_ID = /SW-[A-Z]+-|\bJ[1-8]\b|Ophir/i;

const fakeReport: ReportRecord = {
  id: "r1",
  documentType: "verification_protocol",
  documentNo: "790-00134",
  date: "2026-01-01",
  metadata: {},
  status: "draft",
  authorId: "u1",
  assignedManagerId: null,
  createdAt: "",
  updatedAt: "",
};

function evalCtx(
  section: string,
  content: unknown
): EvaluationContext {
  return {
    section,
    content,
    dependencies: {},
    report: fakeReport,
  };
}

describe("verificationProtocolDefinition", () => {
  it("has no LLM criteria and never depends on design_inputs", () => {
    const designInputs = verificationProtocolDefinition.sections.find(
      (s) => s.key === "design_inputs"
    );
    expect(designInputs?.evaluable).toBe(false);
    expect(designInputs?.editable).toBe(false);

    for (const criteria of Object.values(
      verificationProtocolDefinition.criteriaBySection
    )) {
      for (const c of criteria) {
        expect(c.kind).toBe("deterministic");
        expect(c.dependsOn ?? []).not.toContain("design_inputs");
      }
    }
  });

  it("keeps criterion text free of product IDs", () => {
    for (const criteria of Object.values(
      verificationProtocolDefinition.criteriaBySection
    )) {
      for (const c of criteria) {
        expect(c.key).not.toMatch(PRODUCT_ID);
        expect(c.label).not.toMatch(PRODUCT_ID);
        expect(c.description).not.toMatch(PRODUCT_ID);
      }
    }
  });

  it("keeps check bodies free of product IDs", () => {
    const source = readFileSync(
      new URL("../design-inputs/checks.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toMatch(PRODUCT_ID);
  });

  it("maps the Solea fixture onto SOP criteria without baking IDs into the catalog", () => {
    const ledger = buildLedger({
      srsText: readSrsFixture(),
      planText: readPlanFixture(),
      protocolText: readProtocolFixture(),
    });
    const items = runAllChecks(ledger, {
      policy: CONVERGENT_CHECK_POLICY,
      config: CONVERGENT_PROTOCOL_CONFIG,
    });
    const findings = verificationProtocolDefinition.criteriaBySection.findings;
    const check = (key: string) => {
      const c = findings.find((x) => x.key === key);
      if (!c?.check) throw new Error(`missing ${key}`);
      return c.check(evalCtx("findings", { items }));
    };

    const claimed = check("findings.claimed_vs_tested");
    expect(claimed.status).toBe("not_met");
    expect(claimed.reasoning).toContain(EXPECTED.declaredButUntested[0]);

    const obsolete = check("findings.obsolete_absent");
    expect(obsolete.status).toBe("met");

    const ids = check("findings.ids_resolve");
    expect(ids.status).toBe("not_met");
    expect(ids.reasoning).toContain("SW-SO-4");

    const live = check("findings.live_coverage");
    expect(live.status).toBe("not_met");
    expect(live.reasoning).toContain("SW-AR-5.15");

    const applicability = check("findings.applicability_vs_plan");
    expect(applicability.status).toBe("not_met");
    expect(applicability.reasoning).toContain("SW-SIB-4");

    const oneCode = check("findings.one_config_code");
    expect(oneCode.status).toBe("not_met");
    expect(oneCode.reasoning).toContain("SW-SIB-3");

    const equipment = check("findings.equipment_listed");
    expect(equipment.status).toBe("not_met");
    expect(equipment.reasoning.toLowerCase()).toMatch(/ophir/);

    expect(check("findings.quantitative_tolerance").status).toBe(
      "partially_met"
    );
    expect(check("findings.normative_language").status).toBe("partially_met");
    expect(check("findings.sample_size").status).toBe("partially_met");
  });

  it("grades sources.identity from document numbers, not product IDs", () => {
    const criterion =
      verificationProtocolDefinition.criteriaBySection.sources[0];
    expect(criterion?.check?.(evalCtx("sources", {})).status).toBe("not_met");
    expect(
      criterion?.check?.(
        evalCtx("sources", {
          protocolNo: "P-1",
          protocolRev: "A",
          srsNo: "S-1",
          srsRev: "B",
          planNo: "T-1",
          planRev: "C",
        })
      ).status
    ).toBe("met");
  });
});
