import { describe, expect, it } from "vitest";
import {
  isWorkspaceLoadTelemetryEnabled,
  workspaceLoadTelemetryEnabledFromEnv,
  workspaceLoadTelemetrySchema,
  workspaceNavTimingExtra,
} from "./workspace-load-telemetry";

describe("workspaceLoadTelemetryEnabledFromEnv", () => {
  it("is on for Vercel preview even when NODE_ENV is production", () => {
    expect(
      workspaceLoadTelemetryEnabledFromEnv({
        nodeEnv: "production",
        vercelEnv: "preview",
      })
    ).toBe(true);
  });

  it("is off on Vercel production", () => {
    expect(
      workspaceLoadTelemetryEnabledFromEnv({
        nodeEnv: "production",
        vercelEnv: "production",
      })
    ).toBe(false);
  });

  it("can be forced on in production", () => {
    expect(
      workspaceLoadTelemetryEnabledFromEnv({
        nodeEnv: "production",
        vercelEnv: "production",
        flag: "1",
      })
    ).toBe(true);
  });

  it("is on in local development", () => {
    expect(
      workspaceLoadTelemetryEnabledFromEnv({ nodeEnv: "development" })
    ).toBe(true);
  });
});

describe("isWorkspaceLoadTelemetryEnabled", () => {
  it("is off in unit tests", () => {
    expect(isWorkspaceLoadTelemetryEnabled()).toBe(false);
  });
});

describe("workspaceLoadTelemetrySchema", () => {
  it("accepts a stage beacon", () => {
    const parsed = workspaceLoadTelemetrySchema.safeParse({
      reportId: "r1",
      loadId: "load-1",
      documentType: "equipment_lifecycle_report",
      stage: "bundle_parsed",
      t: 1200,
      extra: { bytes: 54000, status: 200 },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a nav_timing beacon", () => {
    const parsed = workspaceLoadTelemetrySchema.safeParse({
      reportId: "r1",
      loadId: "load-1",
      documentType: "equipment_lifecycle_report",
      stage: "nav_timing",
      t: 4200,
      extra: {
        responseStart: 180,
        domInteractive: 900,
        domContentLoadedEventEnd: 1100,
        s0: "12000b 80ms chunk.js",
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown stages", () => {
    expect(
      workspaceLoadTelemetrySchema.safeParse({
        reportId: "r1",
        loadId: "load-1",
        stage: "not_a_stage",
        t: 1,
      }).success
    ).toBe(false);
  });
});

describe("workspaceNavTimingExtra", () => {
  it("keeps navigation fields and the five slowest scripts", () => {
    const extra = workspaceNavTimingExtra(
      {
        responseStart: 12.4,
        domInteractive: 800.2,
        domContentLoadedEventEnd: 910.9,
      },
      [
        { name: "https://cdn.example/_next/static/chunks/a.js", transferSize: 10, duration: 5 },
        { name: "https://cdn.example/_next/static/chunks/b.js", transferSize: 2000, duration: 40 },
        { name: "https://cdn.example/_next/static/chunks/c.js", transferSize: 100, duration: 40 },
        { name: "https://cdn.example/_next/static/chunks/d.js", transferSize: 1, duration: 1 },
        { name: "https://cdn.example/_next/static/chunks/e.js", transferSize: 1, duration: 2 },
        { name: "https://cdn.example/_next/static/chunks/f.js", transferSize: 9, duration: 3 },
      ]
    );
    expect(extra.responseStart).toBe(12);
    expect(extra.domInteractive).toBe(800);
    expect(extra.domContentLoadedEventEnd).toBe(911);
    expect(extra.s0).toBe("2000b 40ms b.js");
    expect(extra.s1).toBe("100b 40ms c.js");
    expect(extra.s2).toBe("10b 5ms a.js");
    expect(extra.s5).toBeUndefined();
  });
});
