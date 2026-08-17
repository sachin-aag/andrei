import { describe, expect, it } from "vitest";
import { CONVERGENT_PROTOCOL_CONFIG } from "@/lib/customers/convergent/protocol-config";
import { parseTestPlan } from "./parse-test-plan";
import { readPlanFixture } from "./read-fixtures";

const config = CONVERGENT_PROTOCOL_CONFIG;

describe("parseTestPlan", () => {
  it("emits one scope entry per req/release with J-codes expanded", () => {
    const scope = parseTestPlan(readPlanFixture(), config);
    const sib4 = scope.filter((e) => e.reqId === "SW-SIB-4");
    expect(sib4.map((e) => e.jCode)).toEqual(["J5"]);
    expect(sib4[0]?.requiredConfigs).toEqual(
      config.plan.requiredConfigsFor("J5")
    );

    const in11 = scope.filter((e) => e.reqId === "SW-IN-1.1");
    expect(in11.map((e) => `${e.release}:${e.jCode}`)).toEqual(["4.7.1:J8"]);

    const sib3 = scope.filter((e) => e.reqId === "SW-SIB-3");
    expect(sib3.map((e) => `${e.release}:${e.jCode}`).sort()).toEqual([
      "4.7.0:J5",
      "4.7.1:J6",
    ]);
  });
});
