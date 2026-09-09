import { describe, expect, it } from "vitest";
import { formatActiveDuration } from "./activity-format";
import { assembleUserActivityRows, clampPresenceSeconds } from "./activity";

describe("clampPresenceSeconds", () => {
  it("drops junk and caps long gaps", () => {
    expect(clampPresenceSeconds(-4)).toBe(0);
    expect(clampPresenceSeconds(12.9)).toBe(12);
    expect(clampPresenceSeconds(5_000)).toBe(120);
  });
});

describe("formatActiveDuration", () => {
  it("formats seconds, minutes, and hours", () => {
    expect(formatActiveDuration(9)).toBe("9s");
    expect(formatActiveDuration(90)).toBe("1m 30s");
    expect(formatActiveDuration(3_600)).toBe("1h");
    expect(formatActiveDuration(3_660)).toBe("1h 1m");
  });
});

describe("assembleUserActivityRows", () => {
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

  it("omits Sachin and Aditya and keeps zero-time users", () => {
    const rows = assembleUserActivityRows({
      users,
      week: [
        { userId: "u-1", activeSeconds: 120 },
        { userId: "u-2", activeSeconds: 9_999 },
      ],
      month: [
        { userId: "u-1", activeSeconds: 600 },
        { userId: "u-2", activeSeconds: 9_999 },
      ],
    });

    expect(rows.map((row) => row.name)).toEqual([
      "Priya Engineer",
      "Manager One",
    ]);
    expect(rows[0]?.weekActiveSeconds).toBe(120);
    expect(rows[0]?.monthActiveSeconds).toBe(600);
    expect(rows[1]?.weekActiveSeconds).toBe(0);
  });
});
