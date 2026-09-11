"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  hasActiveSessionHold,
  SESSION_HOLD_CHANGED_EVENT,
} from "@/lib/auth/session-activity";

export const INACTIVITY_TIMEOUT_UPDATED_EVENT =
  "mjb:inactivity-timeout-updated";

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
  const [overrideTimeoutMinutes, setOverrideTimeoutMinutes] = useState<
    number | null
  >(null);
  const timerRef = useRef<number | null>(null);
  const lastResetAtRef = useRef(0);
  const signedOutRef = useRef(false);
  const effectiveTimeoutMinutes = overrideTimeoutMinutes ?? timeoutMinutes;

  useEffect(() => {
    const onTimeoutUpdated = (event: Event) => {
      const nextTimeoutMinutes = (
        event as CustomEvent<{ timeoutMinutes?: unknown }>
      ).detail?.timeoutMinutes;

      if (typeof nextTimeoutMinutes === "number") {
        setOverrideTimeoutMinutes(nextTimeoutMinutes);
      }
    };

    window.addEventListener(INACTIVITY_TIMEOUT_UPDATED_EVENT, onTimeoutUpdated);
    return () => {
      window.removeEventListener(
        INACTIVITY_TIMEOUT_UPDATED_EVENT,
        onTimeoutUpdated
      );
    };
  }, []);

  useEffect(() => {
    signedOutRef.current = false;
    lastResetAtRef.current = 0;

    if (
      !Number.isFinite(effectiveTimeoutMinutes) ||
      effectiveTimeoutMinutes <= 0
    ) {
      return;
    }

    const timeoutMs = effectiveTimeoutMinutes * MINUTE_MS;

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
      const onTimeout = () => {
        if (hasActiveSessionHold()) {
          timerRef.current = window.setTimeout(onTimeout, timeoutMs);
          return;
        }
        signedOutRef.current = true;
        void signOut({ callbackUrl: "/login" });
      };
      timerRef.current = window.setTimeout(onTimeout, timeoutMs);
    };

    const onActivity = () => scheduleLogout();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleLogout(true);
    };
    const onHoldChanged = () => {
      if (hasActiveSessionHold()) return;
      scheduleLogout(true);
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(SESSION_HOLD_CHANGED_EVENT, onHoldChanged);
    scheduleLogout(true);

    return () => {
      clearLogoutTimer();
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(SESSION_HOLD_CHANGED_EVENT, onHoldChanged);
    };
  }, [effectiveTimeoutMinutes, userId]);

  return null;
}

