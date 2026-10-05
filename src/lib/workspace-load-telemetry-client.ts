"use client";

import { useEffect } from "react";
import {
  isWorkspaceLoadTelemetryEnabled,
  workspaceNavTimingExtra,
  WORKSPACE_LOAD_TELEMETRY_MAX_BYTES,
  type WorkspaceLoadClientStage,
} from "@/lib/workspace-load-telemetry";

const LONGTASK_CAP = 10;
const LONGTASK_MS = 200;

type Session = {
  reportId: string;
  documentType: string;
  loadId: string;
  activeStage: WorkspaceLoadClientStage | "";
  longtaskCount: number;
  firstEditorReady: boolean;
  cleanup: (() => void) | null;
};

let session: Session | null = null;

function send(stage: WorkspaceLoadClientStage, extra?: Record<string, string | number | boolean>) {
  if (!session || !isWorkspaceLoadTelemetryEnabled()) return;
  if (typeof performance !== "undefined") {
    try {
      performance.mark(`wl:${stage}`);
    } catch {
      // mark name collisions are fine to ignore
    }
  }
  session.activeStage = stage;
  const body = JSON.stringify({
    reportId: session.reportId,
    loadId: session.loadId,
    documentType: session.documentType,
    stage,
    t: typeof performance !== "undefined" ? Math.round(performance.now()) : 0,
    extra,
  });
  if (body.length > WORKSPACE_LOAD_TELEMETRY_MAX_BYTES) return;
  if (typeof fetch !== "function") return;
  void fetch("/api/telemetry/workspace-load", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => {});
}

function attachObservers(current: Session): () => void {
  const onError = (event: ErrorEvent) => {
    send("unhandled", {
      kind: "error",
      message: String(event.message ?? "error").slice(0, 200),
    });
  };
  const onReject = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "rejection";
    send("unhandled", { kind: "rejection", message: message.slice(0, 200) });
  };

  if (typeof window !== "undefined") {
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
  }

  let observer: PerformanceObserver | null = null;
  if (typeof PerformanceObserver !== "undefined") {
    try {
      observer = new PerformanceObserver((list) => {
        if (!session) return;
        for (const entry of list.getEntries()) {
          if (session.longtaskCount >= LONGTASK_CAP) break;
          if (entry.duration < LONGTASK_MS) continue;
          session.longtaskCount += 1;
          send("longtask", {
            duration: Math.round(entry.duration),
            activeStage: session.activeStage || "unknown",
          });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      observer = null;
    }
  }

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
    }
    observer?.disconnect();
    void current;
  };
}

export function startWorkspaceLoadTelemetry(opts: {
  reportId: string;
  documentType: string;
  loadId: string;
}) {
  stopWorkspaceLoadTelemetry();
  if (!isWorkspaceLoadTelemetryEnabled()) return;
  const next: Session = {
    reportId: opts.reportId,
    documentType: opts.documentType,
    loadId: opts.loadId,
    activeStage: "",
    longtaskCount: 0,
    firstEditorReady: false,
    cleanup: null,
  };
  session = next;
  next.cleanup = attachObservers(next);
  send("loader_mounted");
}

export function stopWorkspaceLoadTelemetry() {
  session?.cleanup?.();
  session = null;
}

export function getWorkspaceLoadId(): string | null {
  return session?.loadId ?? null;
}

function collectNavTimingExtra(): Record<string, string | number> | undefined {
  if (typeof performance === "undefined") return undefined;
  if (typeof performance.getEntriesByType !== "function") return undefined;
  try {
    const nav = performance.getEntriesByType(
      "navigation"
    )[0] as PerformanceNavigationTiming | undefined;
    const scripts = performance
      .getEntriesByType("resource")
      .filter(
        (entry): entry is PerformanceResourceTiming =>
          "initiatorType" in entry &&
          (entry as PerformanceResourceTiming).initiatorType === "script"
      )
      .map((entry) => ({
        name: entry.name,
        transferSize: entry.transferSize,
        duration: entry.duration,
      }));
    const extra = workspaceNavTimingExtra(
      nav
        ? {
            responseStart: nav.responseStart,
            domInteractive: nav.domInteractive,
            domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
          }
        : null,
      scripts
    );
    return Object.keys(extra).length > 0 ? extra : undefined;
  } catch {
    return undefined;
  }
}

export function emitWorkspaceLoadStage(
  stage: WorkspaceLoadClientStage,
  extra?: Record<string, string | number | boolean>
) {
  if (stage === "first_editor_ready") {
    if (!session || session.firstEditorReady) return;
    session.firstEditorReady = true;
    send(stage, extra);
    send("nav_timing", collectNavTimingExtra());
    return;
  }
  send(stage, extra);
}

export function WorkspaceLoadBeacon({
  stage,
}: {
  stage: WorkspaceLoadClientStage;
}) {
  useEffect(() => {
    emitWorkspaceLoadStage(stage);
  }, [stage]);
  return null;
}

export function resetWorkspaceLoadTelemetryForTests() {
  stopWorkspaceLoadTelemetry();
}
