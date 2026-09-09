"use client";

import { useEffect } from "react";

export const PRESENCE_HEARTBEAT_INTERVAL_MS = 30_000;

function ping(seconds: number): void {
  if (seconds < 1) return;
  void fetch("/api/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seconds }),
    keepalive: true,
  }).catch(() => undefined);
}

/** Counts foreground time while the signed-in shell is open. */
export function PresenceHeartbeat() {
  useEffect(() => {
    let lastAt = Date.now();
    let intervalId: number | null = null;

    const elapsedSeconds = () => {
      const now = Date.now();
      const seconds = Math.floor((now - lastAt) / 1000);
      lastAt = now;
      return seconds;
    };

    const flush = () => {
      ping(elapsedSeconds());
    };

    const startInterval = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        flush();
      }, PRESENCE_HEARTBEAT_INTERVAL_MS);
    };

    const stopInterval = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    ping(1);
    lastAt = Date.now();
    if (document.visibilityState === "visible") startInterval();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        lastAt = Date.now();
        startInterval();
        return;
      }
      flush();
      stopInterval();
    };

    const onPageHide = () => {
      flush();
      stopInterval();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      flush();
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
