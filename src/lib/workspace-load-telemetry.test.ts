import { describe, expect, it } from "vitest";
import {
  isWorkspaceLoadTelemetryEnabled,
  workspaceLoadTelemetryEnabledFromEnv,
  workspaceLoadTelemetrySchema,
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
