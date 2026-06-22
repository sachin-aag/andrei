"use client";

import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

const MINUTE_MS = 60_000;
const TIMER_RESET_THROTTLE_MS = 1_000;
const ACTIVITY_EVENTS = [
  "keydown",
  "mousedown",
  "mousemove",
  "pointerdown",
  "scroll",
  "touchstart",
] as const;

export function InactivityLogout({
  timeoutMinutes,
  userId,
}: {
  timeoutMinutes: number;
  userId: string;
}) {
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const lastResetAtRef = useRef(0);
  const signedOutRef = useRef(false);

  useEffect(() => {
    signedOutRef.current = false;
    lastResetAtRef.current = 0;

    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
      return;
    }

    const timeoutMs = timeoutMinutes * MINUTE_MS;

    const clearLogoutTimer = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const scheduleLogout = (force = false) => {
      if (signedOutRef.current) return;

      const now = Date.now();
      if (!force && now - lastResetAtRef.current < TIMER_RESET_THROTTLE_MS) {
        return;
      }

      lastResetAtRef.current = now;
      clearLogoutTimer();
      timerRef.current = window.setTimeout(() => {
        signedOutRef.current = true;
        void signOut({ callbackUrl: "/login" });
      }, timeoutMs);
    };

    const onActivity = () => scheduleLogout();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleLogout(true);
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleLogout(true);

    return () => {
      clearLogoutTimer();
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [timeoutMinutes, userId]);

  return null;
}

