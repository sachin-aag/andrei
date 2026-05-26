import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DUPLICATE_DEVIATION_NO_ERROR,
  isDeviationNoTaken,
  normalizeDeviationNo,
} from "@/lib/reports/deviation-no";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

import { db } from "@/db";

describe("normalizeDeviationNo", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeDeviationNo("  DEV/PK/26/001  ")).toBe("DEV/PK/26/001");
  });

  it("does not rewrite separators or casing", () => {
    expect(normalizeDeviationNo("dev pr 24 016")).toBe("dev pr 24 016");
    expect(normalizeDeviationNo("DEV/PR/24/016")).toBe("DEV/PR/24/016");
  });
});

describe("isDeviationNoTaken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for blank deviation numbers", async () => {
    await expect(isDeviationNoTaken("   ", "user-1")).resolves.toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("checks the trimmed literal deviation number", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as never);

    await isDeviationNoTaken("dev pr 24 016", "user-1");

    expect(where).toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("returns true when a matching report exists", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "report-1" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as never);

    await expect(isDeviationNoTaken("DEV-001", "user-1")).resolves.toBe(true);
  });
});

describe("DUPLICATE_DEVIATION_NO_ERROR", () => {
  it("is user-facing copy for duplicate names", () => {
    expect(DUPLICATE_DEVIATION_NO_ERROR).toMatch(/already have a report/i);
  });
});
