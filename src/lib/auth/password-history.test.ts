import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: vi.fn(),
}));

import { verifyPassword } from "@/lib/auth/password";
import {
  initialPasswordHistory,
  isPasswordRecentlyUsed,
  nextPasswordHistory,
  recentPasswordHashes,
} from "@/lib/auth/password-history";

describe("recentPasswordHashes", () => {
  it("returns stored history when it starts with the current hash", () => {
    expect(
      recentPasswordHashes({
        currentPasswordHash: "current.hash",
        passwordHistory: ["current.hash", "hash-a", "hash-b"],
        historyLimit: 3,
      })
    ).toEqual(["current.hash", "hash-a", "hash-b"]);
  });

  it("prepends current hash for legacy rows and trims to historyLimit", () => {
    expect(
      recentPasswordHashes({
        currentPasswordHash: "current.hash",
        passwordHistory: ["hash-a", "hash-b", "hash-c"],
        historyLimit: 3,
      })
    ).toEqual(["current.hash", "hash-a", "hash-b"]);
  });

  it("returns only the current hash when history is empty", () => {
    expect(
      recentPasswordHashes({
        currentPasswordHash: "current.hash",
        passwordHistory: [],
        historyLimit: 3,
      })
    ).toEqual(["current.hash"]);
  });
});

describe("initialPasswordHistory", () => {
  it("stores the active hash as the first entry", () => {
    expect(initialPasswordHistory("hash-a", 3)).toEqual(["hash-a"]);
  });
});

describe("nextPasswordHistory", () => {
  it("stores the new hash first and keeps prior passwords up to historyLimit", () => {
    expect(
      nextPasswordHistory({
        newPasswordHash: "hash-new",
        currentHistory: ["hash-c", "hash-a"],
        previousPasswordHash: "hash-c",
        historyLimit: 3,
      })
    ).toEqual(["hash-new", "hash-c", "hash-a"]);
  });

  it("includes legacy prior hashes when history excluded the active hash", () => {
    expect(
      nextPasswordHistory({
        newPasswordHash: "hash-new",
        currentHistory: ["hash-a", "hash-b"],
        previousPasswordHash: "hash-c",
        historyLimit: 3,
      })
    ).toEqual(["hash-new", "hash-c", "hash-a"]);
  });

  it("returns only the new hash when there is no previous hash", () => {
    expect(
      nextPasswordHistory({
        newPasswordHash: "hash-new",
        currentHistory: [],
        previousPasswordHash: null,
        historyLimit: 3,
      })
    ).toEqual(["hash-new"]);
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
        passwordHistory: ["current.hash"],
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
        passwordHistory: ["current.hash", "old.hash"],
        historyLimit: 3,
      })
    ).resolves.toBe(true);
  });
});
