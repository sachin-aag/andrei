/**
 * Concurrency + per-section serialization for QSR RTM family workers.
 * Same slot shape as `withSheetExtractSlot`; the dispatcher lock is a
 * tail promise keyed `${reportId}\0${section}` (comments, not section JSON).
 */

export const RTM_WORKER_CONCURRENCY = 4;
export const RTM_WORKER_BUDGET_MS = 90_000;
export const RTM_WORKER_MIN_START_MS = 20_000;

const waiters: Array<() => void> = [];
let inflight = 0;

export async function withRtmWorkerSlot<T>(task: () => Promise<T>): Promise<T> {
  if (inflight >= RTM_WORKER_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  }
  inflight += 1;
  try {
    return await task();
  } finally {
    inflight -= 1;
    waiters.shift()?.();
  }
}

const draftTails = new Map<string, Promise<void>>();

function draftLockKey(reportId: string, section: string): string {
  return `${reportId}\0${section}`;
}

/** One `draft_rtm_table` at a time per report+section. */
export async function withRtmDraftLock<T>(
  reportId: string,
  section: string,
  task: () => Promise<T>
): Promise<T> {
  const key = draftLockKey(reportId, section);
  const previous = draftTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  draftTails.set(key, done);
  try {
    await previous;
    return await task();
  } finally {
    release();
    if (draftTails.get(key) === done) {
      draftTails.delete(key);
    }
  }
}
