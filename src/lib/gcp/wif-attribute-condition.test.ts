import { describe, expect, it } from "vitest";
import {
  addVercelProjectToAttributeCondition,
  parseWifAudience,
} from "./wif-attribute-condition";

describe("parseWifAudience", () => {
  it("splits pool and provider from a full audience", () => {
    expect(
      parseWifAudience(
        "//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/vercel/providers/vercel-oidc"
      )
    ).toEqual({
      projectNumber: "123",
      pool: "vercel",
      provider: "vercel-oidc",
    });
  });

  it("rejects a truncated audience", () => {
    expect(() => parseWifAudience("vercel")).toThrow(/GCP_WIF_AUDIENCE/);
  });
});

describe("addVercelProjectToAttributeCondition", () => {
  it("returns the same string when the project is already listed", () => {
    const current = "assertion.project_id in ['prj_aaa', 'prj_bbb']";
    expect(addVercelProjectToAttributeCondition(current, "prj_aaa")).toBe(
      current
    );
  });

  it("appends to an in-list", () => {
    expect(
      addVercelProjectToAttributeCondition(
        "assertion.project_id in ['prj_aaa', 'prj_bbb']",
        "prj_ccc"
      )
    ).toBe("assertion.project_id in ['prj_aaa', 'prj_bbb', 'prj_ccc']");
  });

  it("keeps a surrounding owner_id guard", () => {
    expect(
      addVercelProjectToAttributeCondition(
        "(assertion.owner_id == 'team_x') && assertion.project_id in ['prj_aaa']",
        "prj_bbb"
      )
    ).toBe(
      "(assertion.owner_id == 'team_x') && assertion.project_id in ['prj_aaa', 'prj_bbb']"
    );
  });

  it("promotes a single equality to an in-list", () => {
    expect(
      addVercelProjectToAttributeCondition(
        "assertion.project_id == 'prj_aaa'",
        "prj_bbb"
      )
    ).toBe("assertion.project_id in ['prj_aaa', 'prj_bbb']");
  });

  it("folds a chain of equalities", () => {
    expect(
      addVercelProjectToAttributeCondition(
        "assertion.project_id == 'prj_aaa' || assertion.project_id == 'prj_bbb'",
        "prj_ccc"
      )
    ).toBe("assertion.project_id in ['prj_aaa', 'prj_bbb', 'prj_ccc']");
  });

  it("seeds an empty condition", () => {
    expect(addVercelProjectToAttributeCondition("", "prj_aaa")).toBe(
      "assertion.project_id == 'prj_aaa'"
    );
  });

  it("throws on an unknown CEL shape", () => {
    expect(() =>
      addVercelProjectToAttributeCondition("google.subject == 'x'", "prj_aaa")
    ).toThrow(/Cannot automatically add/);
  });

  it("rejects a non-prj id", () => {
    expect(() =>
      addVercelProjectToAttributeCondition(
        "assertion.project_id in ['prj_aaa']",
        "andrei-ami"
      )
    ).toThrow(/Invalid Vercel project id/);
  });
});
