/**
 * Per-chunk abort signal that does not count time while the tab is hidden.
 * Chrome can freeze a background tab long enough that AbortSignal.timeout
 * would abort a PUT that was only paused, not stuck.
 *
 * Closing or discarding the tab still stops the upload; this only avoids a
 * false timeout after the user switches away.
 */
export function createUploadChunkTimeout(timeoutMs: number): {
  signal: AbortSignal;
  dispose: () => void;
} {
  if (typeof document === "undefined") {
    return {
      signal: AbortSignal.timeout(timeoutMs),
      dispose: () => undefined,
    };
  }

  const controller = new AbortController();
  let remainingMs = timeoutMs;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;

  const abortForTimeout = () => {
    controller.abort(
      typeof DOMException === "undefined"
        ? undefined
        : new DOMException("The operation timed out.", "TimeoutError")
    );
  };

  const clearTimer = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const startTimer = () => {
    clearTimer();
    if (controller.signal.aborted) return;
    if (document.visibilityState === "hidden") return;
    if (remainingMs <= 0) {
      abortForTimeout();
      return;
    }
    startedAt = Date.now();
    timer = setTimeout(abortForTimeout, remainingMs);
  };

  const onVisibilityChange = () => {
    if (controller.signal.aborted) return;
    if (document.visibilityState === "hidden") {
      if (timer !== null) {
        remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
        clearTimer();
      }
      return;
    }
    startTimer();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  startTimer();

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}

export async function fetchWithUploadChunkTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const timeout = createUploadChunkTimeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout.signal])
    : timeout.signal;
  try {
    return await fetch(input, { ...init, signal });
  } finally {
    timeout.dispose();
  }
}
