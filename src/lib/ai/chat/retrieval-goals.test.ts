import { describe, expect, it } from "vitest";
import {
  planRetrievalGoals,
  retrievalQueriesForSearch,
} from "./retrieval-goals";

describe("planRetrievalGoals", () => {
  it("fans a complete URS list into requirement sets and IQ/OQ/PQ searches", () => {
    const goals = planRetrievalGoals(
      "draft table 5 with complete list of URSes"
    );
    expect(goals.map((goal) => goal.goal)).toEqual([
      "The request",
      "URS requirement statements",
      "Process requirement URS set",
      "Control philosophy URS set",
      "GMP and safety URS set",
      "Installation qualification references",
      "Operational qualification references",
      "Performance qualification references",
    ]);
    expect(goals.some((goal) => goal.query.includes("IQ"))).toBe(true);
    expect(goals.some((goal) => goal.query.includes("OQ"))).toBe(true);
    expect(goals.some((goal) => goal.query.includes("PQ"))).toBe(true);
  });

  it("groups named URS ids into sets and still searches the protocols", () => {
    const goals = planRetrievalGoals(
      "fill the RTM for URS-1 URS-2 URS-3 URS-9"
    );
    expect(goals.some((goal) => goal.query.includes("URS-1 OR URS-2"))).toBe(
      true
    );
    expect(goals.some((goal) => goal.goal.includes("Installation"))).toBe(true);
    expect(goals.some((goal) => goal.goal.includes("Process requirement"))).toBe(
      false
    );
  });

  it("leaves a single fact as the model's query", () => {
    expect(planRetrievalGoals("what is the batch number")).toEqual([]);
    expect(
      retrievalQueriesForSearch({
        userText: "what is the batch number",
        query: "batch number",
      })
    ).toEqual({ goals: [], queries: ["batch number"] });
  });

  it("does not fan out again once pages are excluded", () => {
    const planned = retrievalQueriesForSearch({
      userText: "draft table 5 with complete list of URSes",
      query: "URS-13",
      excludePages: [{ attachmentId: "a", pageNumber: 2 }],
    });
    expect(planned.goals).toEqual([]);
    expect(planned.queries).toEqual(["URS-13"]);
  });
});
