"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type UseAutoSaveOptions<T> = {
  value: T;
  onSave: (value: T) => Promise<void>;
  delayMs?: number;
  enabled?: boolean;
  beaconUrl?: string;
  serialize?: (value: T) => string;
};

export function useAutoSave<T>({
  value,
  onSave,
  delayMs = 1500,
  enabled = true,
  beaconUrl,
  serialize,
}: UseAutoSaveOptions<T>) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const latestValue = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSaving = useRef(false);
  const pending = useRef(false);
  /**
   * Serialized snapshot of the last value we either saved or scheduled. Used to
   * skip work when a parent re-render hands us a new object reference whose
   * contents haven't actually changed (very common, since callers usually pass
   * an inline `{ ... }` literal).
   */
  const serializeValue = useCallback(
    (v: T) => (serialize ? serialize(v) : JSON.stringify(v)),
    [serialize]
  );
  const lastSerialized = useRef<string>(serializeValue(value));

  /** Keep in sync every render so flush() after flushSync(onChange) sees the latest doc immediately. */
  latestValue.current = value;

  const flush = useCallback(async () => {
    if (!enabled) return;
    if (isSaving.current) {
      pending.current = true;
      return;
    }
    isSaving.current = true;
    setStatus("saving");
    try {
      const snapshot = latestValue.current;
      await onSave(snapshot);
      lastSerialized.current = serializeValue(snapshot);
      setStatus("saved");
      setLastSavedAt(new Date());
    } catch (err) {
      console.error("AutoSave error", err);
      setStatus("error");
    } finally {
      isSaving.current = false;
      if (pending.current) {
        pending.current = false;
        flush();
      }
    }
  }, [enabled, onSave]);

  useEffect(() => {
    if (!enabled) return;
    const next = serializeValue(value);
    if (next === lastSerialized.current) return;
    lastSerialized.current = next;
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(() => {
      flush();
    }, delayMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs, enabled]);

  useEffect(() => {
    if (!enabled || !beaconUrl) return;
    const handler = () => {
      try {
        const body = serialize
          ? serialize(latestValue.current)
          : JSON.stringify(latestValue.current);
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(beaconUrl, blob);
      } catch {}
    };
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [beaconUrl, enabled, serialize]);

  return { status, lastSavedAt, flush };
}
