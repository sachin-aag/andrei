import { describe, expect, it } from "vitest";
import {
  CUSTOMER_NEON_PREVIEW_PROJECTS,
  isProtectedGitRef,
  resolveNeonPreviewProjectIds,
} from "@/lib/db/neon-preview-projects";

describe("CUSTOMER_NEON_PREVIEW_PROJECTS", () => {
  it("includes 3xper with the production Neon project id", () => {
    expect(CUSTOMER_NEON_PREVIEW_PROJECTS.map((project) => project.label)).toEqual(
      ["mj", "demo", "convergent", "3xper"]
    );
    expect(
      CUSTOMER_NEON_PREVIEW_PROJECTS.find((project) => project.label === "3xper")
    ).toMatchObject({
      id: "dark-salad-24878113",
      envVar: "NEON_PROJECT_ID_3XPER",
    });
  });
});

describe("isProtectedGitRef", () => {
  it("skips main and master", () => {
    expect(isProtectedGitRef("main")).toBe(true);
    expect(isProtectedGitRef("master")).toBe(true);
    expect(isProtectedGitRef("cursor/example")).toBe(false);
  });
});

describe("resolveNeonPreviewProjectIds", () => {
  it("returns every known pack when GitHub vars are unset", () => {
    expect(resolveNeonPreviewProjectIds({})).toEqual([
      { label: "mj", id: "blue-block-88692066" },
      { label: "demo", id: "bold-field-45608643" },
      { label: "convergent", id: "cold-thunder-36255681" },
      { label: "3xper", id: "dark-salad-24878113" },
    ]);
  });

  it("treats empty NEON_PROJECT_ID_3XPER as the hardcoded 3xper id", () => {
    const projects = resolveNeonPreviewProjectIds({
      NEON_PROJECT_ID_3XPER: "  ",
    });
    expect(projects.find((project) => project.label === "3xper")).toEqual({
      label: "3xper",
      id: "dark-salad-24878113",
    });
  });

  it("lets NEON_PROJECT_ID_3XPER override the hardcoded id", () => {
    const projects = resolveNeonPreviewProjectIds({
      NEON_PROJECT_ID_3XPER: "custom-3xper",
    });
    expect(projects.find((project) => project.label === "3xper")).toEqual({
      label: "3xper",
      id: "custom-3xper",
    });
  });

  it("targets only NEON_PROJECT_ID when set (local one-off)", () => {
    expect(
      resolveNeonPreviewProjectIds({ NEON_PROJECT_ID: "dark-salad-24878113" })
    ).toEqual([{ label: "explicit", id: "dark-salad-24878113" }]);
  });
});
