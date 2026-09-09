import { describe, expect, it } from "vitest";
import { isoWeekBoundsUtc } from "./cycle";
import { assembleUserSpendRows } from "./user-spend";

describe("isoWeekBoundsUtc", () => {
  it("starts Monday 00:00 UTC", () => {
    const { weekStart, weekEnd } = isoWeekBoundsUtc(
      new Date("2026-09-09T15:00:00.000Z")
    );
    expect(weekStart.toISOString()).toBe("2026-09-07T00:00:00.000Z");
    expect(weekEnd.toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });
});

describe("assembleUserSpendRows", () => {
  const users = [
    {
      id: "u-1",
      name: "Priya Engineer",
      email: "priya@mjbiopharm.com",
      role: "engineer",
      deactivatedAt: null,
    },
    {
      id: "u-2",
      name: "Sachin",
      email: "sachin@andreihealth.com",
      role: "admin",
      deactivatedAt: null,
    },
    {
      id: "u-3",
      name: "Manager One",
      email: "manager@mjbiopharm.com",
      role: "manager",
      deactivatedAt: null,
    },
  ];

  it("omits Sachin and Aditya, includes zero-spend users, and unattributed spend", () => {
    const rows = assembleUserSpendRows({
      users,
      week: [
        { userId: "u-1", spendUsd: 1.5 },
        { userId: "u-2", spendUsd: 99 },
        { userId: null, spendUsd: 0.25 },
      ],
      month: [
        { userId: "u-1", spendUsd: 4 },
        { userId: "u-2", spendUsd: 200 },
        { userId: null, spendUsd: 0.25 },
      ],
    });

    expect(rows.map((row) => row.name)).toEqual([
      "Priya Engineer",
      "Unattributed",
      "Manager One",
    ]);
    expect(rows[0]?.weekSpendUsd).toBe(1.5);
    expect(rows[0]?.monthSpendUsd).toBe(4);
    expect(rows[1]?.userId).toBeNull();
    expect(rows[2]?.weekSpendUsd).toBe(0);
    expect(rows[2]?.monthSpendUsd).toBe(0);
  });
});
