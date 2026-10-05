import { z } from "zod";

export const WORKSPACE_LOAD_ID_HEADER = "x-workspace-load-id";
export const WORKSPACE_LOAD_TELEMETRY_MAX_BYTES = 4096;

export const WORKSPACE_LOAD_CLIENT_STAGES = [
  "loader_mounted",
  "bundle_request_start",
  "bundle_response",
  "bundle_parsed",
  "editors_chunk_ready",
  "provider_mounted",
  "workspace_module",
  "workspace_mounted",
  "section_mounted",
  "first_editor_ready",
  "nav_timing",
  "longtask",
  "error",
  "timeout",
  "unhandled",
] as const;

export type WorkspaceLoadClientStage =
  (typeof WORKSPACE_LOAD_CLIENT_STAGES)[number];

const extraValueSchema = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
]);

export const workspaceLoadTelemetrySchema = z.object({
  reportId: z.string().min(1).max(64),
  loadId: z.string().min(1).max(64),
  documentType: z.string().max(80).optional(),
  stage: z.enum(WORKSPACE_LOAD_CLIENT_STAGES),
  t: z.number().int().min(0).max(3_600_000),
  extra: z.record(z.string().max(40), extraValueSchema).optional(),
});

export type WorkspaceLoadTelemetryEvent = z.infer<
  typeof workspaceLoadTelemetrySchema
>;

/**
 * On outside production: local development and Vercel preview.
 * Off on Vercel production unless NEXT_PUBLIC_WORKSPACE_LOAD_TELEMETRY=1.
 * Preview is NODE_ENV=production + VERCEL_ENV=preview — do not use NODE_ENV alone.
 */
export function workspaceLoadTelemetryEnabledFromEnv(env: {
  nodeEnv?: string;
  vercelEnv?: string;
  flag?: string;
}): boolean {
  if (env.flag === "1") return true;
  if (env.flag === "0") return false;
  if (env.vercelEnv === "production") return false;
  if (env.vercelEnv === "preview" || env.vercelEnv === "development") return true;
  return env.nodeEnv !== "production";
}

export function isWorkspaceLoadTelemetryEnabled(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  return workspaceLoadTelemetryEnabledFromEnv({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV,
    flag: process.env.NEXT_PUBLIC_WORKSPACE_LOAD_TELEMETRY,
  });
}

export function newWorkspaceLoadId(): string {
  return crypto.randomUUID();
}

const NAV_TIMING_SCRIPT_CAP = 5;

/** Flatten navigation + top script resources into telemetry extra fields. */
export function workspaceNavTimingExtra(
  navigation: {
    responseStart: number;
    domInteractive: number;
    domContentLoadedEventEnd: number;
  } | null,
  scripts: Array<{ name: string; transferSize: number; duration: number }>
): Record<string, string | number> {
  const extra: Record<string, string | number> = {};
  if (navigation) {
    extra.responseStart = Math.round(navigation.responseStart);
    extra.domInteractive = Math.round(navigation.domInteractive);
    extra.domContentLoadedEventEnd = Math.round(
      navigation.domContentLoadedEventEnd
    );
  }
  const top = scripts
    .toSorted(
      (a, b) => b.duration - a.duration || b.transferSize - a.transferSize
    )
    .slice(0, NAV_TIMING_SCRIPT_CAP);
  for (const [i, entry] of top.entries()) {
    const name = (entry.name.split("/").pop() || "script").slice(0, 80);
    extra[`s${i}`] =
      `${Math.round(entry.transferSize)}b ${Math.round(entry.duration)}ms ${name}`;
  }
  return extra;
}

export function logWorkspaceLoadServer(event: {
  reportId: string;
  loadId?: string;
  documentType?: string;
  stage: string;
  t?: number;
  extra?: Record<string, string | number | boolean | undefined>;
}) {
  if (!isWorkspaceLoadTelemetryEnabled()) return;
  const extra = event.extra
    ? Object.fromEntries(
        Object.entries(event.extra).filter(
          (entry): entry is [string, string | number | boolean] =>
            entry[1] !== undefined
        )
      )
    : undefined;
  console.info("[wl]", {
    reportId: event.reportId,
    loadId: event.loadId,
    documentType: event.documentType,
    stage: event.stage,
    t: event.t,
    ...extra,
  });
}
