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

  it("searches discovered URS ids in the URS and in each protocol family", () => {
    const goals = planRetrievalGoals("draft table 5 with the complete list of URSes", [
      "URS-10",
      "URS-2",
      "URS-1",
    ]);
    expect(goals.map((goal) => goal.goal)).toEqual([
      "URS-1–URS-10 in the URS",
      "URS-1–URS-10 in the IQ",
      "URS-1–URS-10 in the OQ",
      "URS-1–URS-10 in the PQ",
      "URS-1–URS-10 in the DQ",
    ]);
    expect(goals[0]?.query).toBe("URS-1 OR URS-2 OR URS-10");
    expect(goals.every((goal) => goal.query === goals[0]?.query)).toBe(true);
  });

  it("uses URS ids named in the request when the file list is not loaded yet", () => {
    const goals = planRetrievalGoals("fill the RTM for URS-1 URS-2 URS-3 URS-9");
    expect(goals[0]?.goal).toBe("URS-1–URS-9 in the URS");
    expect(goals.some((goal) => goal.goal.endsWith("in the IQ"))).toBe(true);
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
