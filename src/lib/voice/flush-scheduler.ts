import { VOICE_MAX_IN_FLIGHT } from "@/lib/voice/constants";

export type VoiceFlushScheduler = {
  request: (force: boolean) => void;
  whenIdle: () => Promise<void>;
  reset: () => void;
};

/**
 * Caps overlapping unary transcribes and coalesces extras into one follow-up
 * with the latest PCM (snapshotted when `run` executes).
 */
export function createVoiceFlushScheduler(options: {
  maxInFlight?: number;
  run: (force: boolean) => Promise<void>;
}): VoiceFlushScheduler {
  const maxInFlight = options.maxInFlight ?? VOICE_MAX_IN_FLIGHT;
  let inFlight = 0;
  let pending = false;
  let pendingForce = false;
  let idleWaiters: Array<() => void> = [];

  function notifyIdle() {
    if (inFlight > 0 || pending) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const waiter of waiters) waiter();
  }

  function launch(force: boolean) {
    inFlight += 1;
    void options
      .run(force)
      .catch(() => {
        /* `run` reports errors; drain so stop() can finish. */
      })
      .finally(() => {
        inFlight -= 1;
        if (pending && inFlight < maxInFlight) {
          const nextForce = pendingForce;
          pending = false;
          pendingForce = false;
          launch(nextForce);
          return;
        }
        notifyIdle();
      });
  }

  return {
    request(force: boolean) {
      if (inFlight >= maxInFlight) {
        pending = true;
        pendingForce = pendingForce || force;
        return;
      }
      launch(force);
    },
    whenIdle() {
      if (inFlight === 0 && !pending) return Promise.resolve();
      return new Promise<void>((resolve) => {
        idleWaiters.push(resolve);
      });
    },
    reset() {
      pending = false;
      pendingForce = false;
      idleWaiters = [];
    },
  };
}
