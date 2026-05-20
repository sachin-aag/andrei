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
});

describe("isDeviationNoTaken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for blank deviation numbers", async () => {
    await expect(isDeviationNoTaken("   ")).resolves.toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("checks trimmed deviation numbers", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as never);

    await isDeviationNoTaken("  DEV-001  ");

    expect(where).toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("returns true when a matching report exists", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "report-1" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    vi.mocked(db.select).mockReturnValue({ from } as never);

    await expect(isDeviationNoTaken("DEV-001")).resolves.toBe(true);
  });
});

describe("DUPLICATE_DEVIATION_NO_ERROR", () => {
  it("is user-facing copy for duplicate names", () => {
    expect(DUPLICATE_DEVIATION_NO_ERROR).toMatch(/already exists/i);
  });
});
