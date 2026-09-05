import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {},
}));

import { libraryScopeForUser } from "./library-access";

describe("libraryScopeForUser", () => {
  it("defaults non-admins to mine", () => {
    expect(libraryScopeForUser({ role: "engineer" })).toBe("mine");
    expect(libraryScopeForUser({ role: "engineer" }, "all")).toBe("mine");
  });

  it("lets admins browse all workspace assets by default", () => {
    expect(libraryScopeForUser({ role: "admin" })).toBe("all");
    expect(libraryScopeForUser({ role: "admin" }, "shared")).toBe("shared");
  });
});
