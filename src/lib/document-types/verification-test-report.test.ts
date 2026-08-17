import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONVERGENT_PROTOCOL_CONFIG } from "@/lib/customers/convergent/protocol-config";
import { buildLedger } from "@/lib/design-inputs/build-ledger";
import {
  readPlanFixture,
  readProtocolFixture,
  readSrsFixture,
} from "@/lib/design-inputs/read-fixtures";
import { requirementsVerifiedRows } from "@/lib/design-inputs/requirements-verified";
import type { EvaluationContext } from "./types";
import { verificationTestReportDefinition } from "./verification-test-report";
import type { ReportRecord } from "@/types/report";

const PRODUCT_ID = /SW-[A-Z]+-|\bJ[1-8]\b|Ophir/i;

const fakeReport: ReportRecord = {
  id: "r1",
  documentType: "verification_test_report",
  documentNo: "790-00134R",
  date: "2026-01-01",
  metadata: { revision: "U", productName: "Example" },
  status: "draft",
  authorId: "u1",
  assignedManagerId: null,
  createdAt: "",
  updatedAt: "",
};

function evalCtx(
  section: string,
  content: unknown,
  dependencies: Record<string, unknown> = {}
): EvaluationContext {
  return {
    section,
    content,
    dependencies,
    report: fakeReport,
  };
}

describe("verificationTestReportDefinition", () => {
  it("keeps criterion text free of product IDs", () => {
    for (const criteria of Object.values(
      verificationTestReportDefinition.criteriaBySection
    )) {
      for (const c of criteria) {
        expect(c.key).not.toMatch(PRODUCT_ID);
        expect(c.label).not.toMatch(PRODUCT_ID);
        expect(c.description).not.toMatch(PRODUCT_ID);
      }
    }
  });

  it("keeps the deterministic check source free of product IDs", () => {
    const source = readFileSync(
      new URL("./verification-test-report/deterministic-checks.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toMatch(PRODUCT_ID);
  });

  it("does not evaluate design_inputs with LLM", () => {
    const designInputs = verificationTestReportDefinition.sections.find(
      (s) => s.key === "design_inputs"
    );
    expect(designInputs?.evaluable).toBe(false);
    expect(designInputs?.editable).toBe(false);
    for (const criteria of Object.values(
      verificationTestReportDefinition.criteriaBySection
    )) {
      for (const c of criteria) {
        if (c.kind === "llm") {
          expect(c.dependsOn ?? []).not.toContain("design_inputs");
        }
      }
    }
  });

  it("generates Requirements Verified from the ledger without a P/F column", () => {
    const ledger = buildLedger(
      {
        srsText: readSrsFixture(),
        planText: readPlanFixture(),
        protocolText: readProtocolFixture(),
      },
      CONVERGENT_PROTOCOL_CONFIG
    );
    const criterion =
      verificationTestReportDefinition.criteriaBySection.results_discussion.find(
        (c) => c.key === "results_discussion.requirements_verified"
      );
    expect(criterion?.kind).toBe("deterministic");
    const result = criterion?.check?.(
      evalCtx("results_discussion", { observations: {} }, { design_inputs: ledger })
    );
    expect(result?.status).toBe("met");
    expect(result?.reasoning).not.toMatch(PRODUCT_ID);

    const rows = requirementsVerifiedRows(ledger);
    expect(rows[0]).not.toHaveProperty("passFail");
  });

  it("fails Requirements Verified when the ledger is empty", () => {
    const criterion =
      verificationTestReportDefinition.criteriaBySection.results_discussion.find(
        (c) => c.key === "results_discussion.requirements_verified"
      );
    const result = criterion?.check?.(
      evalCtx("results_discussion", {}, { design_inputs: { requirements: [] } })
    );
    expect(result?.status).toBe("not_met");
  });
});
