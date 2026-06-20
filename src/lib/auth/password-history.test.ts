import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: vi.fn(),
}));

import { verifyPassword } from "@/lib/auth/password";
import {
  isPasswordRecentlyUsed,
  nextPasswordHistory,
} from "@/lib/auth/password-history";

describe("nextPasswordHistory", () => {
  it("prepends the previous hash and trims to historyLimit - 1", () => {
    expect(
      nextPasswordHistory({
        currentHistory: ["hash-a", "hash-b"],
        previousPasswordHash: "hash-c",
        historyLimit: 3,
      })
    ).toEqual(["hash-c", "hash-a"]);
  });

  it("returns current history when there is no previous hash", () => {
    expect(
      nextPasswordHistory({
        currentHistory: ["hash-a"],
        previousPasswordHash: null,
        historyLimit: 3,
      })
    ).toEqual(["hash-a"]);
  });
});

describe("isPasswordRecentlyUsed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the password matches the current hash", async () => {
    vi.mocked(verifyPassword).mockResolvedValueOnce(true);

    await expect(
      isPasswordRecentlyUsed({
        password: "secret",
        currentPasswordHash: "current.hash",
        passwordHistory: [],
        historyLimit: 3,
      })
    ).resolves.toBe(true);
  });

  it("checks prior hashes when the current hash does not match", async () => {
    vi.mocked(verifyPassword)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      isPasswordRecentlyUsed({
        password: "secret",
        currentPasswordHash: "current.hash",
        passwordHistory: ["old.hash"],
        historyLimit: 3,
      })
    ).resolves.toBe(true);
  });
});
