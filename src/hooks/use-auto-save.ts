"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Debounce before persisting after the last edit (report sections, header, criteria review). */
export const AUTOSAVE_DELAY_MS = 1500;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type AutoSaveContext = {
  signal?: AbortSignal;
};

export type UseAutoSaveOptions<T> = {
  value: T;
  onSave: (value: T, context?: AutoSaveContext) => Promise<void>;
  delayMs?: number;
  enabled?: boolean;
  beaconUrl?: string;
  serialize?: (value: T) => string;
};

function isBenignSaveError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

export function useAutoSave<T>({
  value,
  onSave,
  delayMs = AUTOSAVE_DELAY_MS,
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
  const flushWaiters = useRef<Array<() => void>>([]);
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
  const serializeValueRef = useRef(serializeValue);
  useLayoutEffect(() => {
    serializeValueRef.current = serializeValue;
  }, [serializeValue]);
  const lastSerialized = useRef<string>(serializeValue(value));
  /** Last value confirmed persisted by a successful `onSave`. */
  const lastPersisted = useRef<string>(serializeValue(value));
  const abortRef = useRef<AbortController | null>(null);
  const persistDirtyOnLeave = useRef<() => void>(() => {});
  const wasEnabled = useRef(enabled);

  /** Keep in sync so flush() after flushSync(onChange) sees the latest doc immediately. */
  useLayoutEffect(() => {
    latestValue.current = value;
  }, [value]);

  useLayoutEffect(() => {
    persistDirtyOnLeave.current = () => {
      if (!enabled || !beaconUrl) return;
      const body = serializeValueRef.current(latestValue.current);
      if (body === lastPersisted.current) return;
      try {
        void fetch(beaconUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      } catch {
        try {
          navigator.sendBeacon(
            beaconUrl,
            new Blob([body], { type: "application/json" })
          );
        } catch {
          // Page is unloading; best-effort only.
        }
      }
      lastPersisted.current = body;
      lastSerialized.current = body;
    };
  }, [enabled, beaconUrl]);

  const flushImpl = useRef<() => Promise<void>>(async () => {});

  useLayoutEffect(() => {
    flushImpl.current = async () => {
      if (!enabled) return;

      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }

      if (isSaving.current) {
        pending.current = true;
        await new Promise<void>((resolve) => {
          flushWaiters.current.push(resolve);
        });
        return;
      }

      const snapshot = latestValue.current;
      const serialized = serializeValueRef.current(snapshot);
      if (serialized === lastPersisted.current) {
        return;
      }

      isSaving.current = true;
      setStatus("saving");
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await onSave(snapshot, { signal: controller.signal });
        if (controller.signal.aborted) return;
        lastSerialized.current = serialized;
        lastPersisted.current = serialized;
        setStatus("saved");
        setLastSavedAt(new Date());
      } catch (err) {
        if (isBenignSaveError(err, controller.signal)) return;
        console.error("AutoSave error", err);
        setStatus("error");
        throw err;
      } finally {
        isSaving.current = false;
        if (pending.current) {
          pending.current = false;
          try {
            await flushImpl.current();
          } catch {
            // Surface via status; waiters still release below.
          }
        }
        const waiters = flushWaiters.current;
        flushWaiters.current = [];
        for (const resolve of waiters) resolve();
      }
    };
  }, [enabled, onSave]);

  // Persist first in declaration so abort cleanup runs first on unmount
  // (in-flight PATCH is cancelled, then keepalive POST sends the latest value).
  useEffect(
    () => () => {
      persistDirtyOnLeave.current();
    },
    []
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const flush = useCallback(() => flushImpl.current(), []);

  useEffect(() => {
    const justEnabled = enabled && !wasEnabled.current;
    wasEnabled.current = enabled;
    if (!enabled) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (!isSaving.current) {
        setStatus((current) => (current === "saving" ? "idle" : current));
      }
      return;
    }
    const next = serializeValue(value);
    if (next === lastPersisted.current) {
      lastSerialized.current = next;
      return;
    }
    if (next === lastSerialized.current && !justEnabled) return;
    lastSerialized.current = next;
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(() => {
      void flush().catch(() => {
        // Status already set to "error" inside flush.
      });
    }, delayMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs, enabled]);

  useEffect(() => {
    if (!enabled || !beaconUrl) return;
    const handler = () => {
      persistDirtyOnLeave.current();
    };
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [beaconUrl, enabled]);

  return { status, lastSavedAt, flush };
}
