const tails = new Map<string, Promise<void>>();

/**
 * Run worksheet mutations for one report one at a time.
 * Parallel `write_column` / `manage_worksheet` tool calls otherwise each read
 * the same snapshot and the last persist wipes the others — the grid then
 * flashes fill / empty / fill as those snapshots reload.
 */
export async function withWorksheetMutationLock<T>(
  reportId: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = tails.get(reportId) ?? Promise.resolve();
  let release!: () => void;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  tails.set(reportId, done);
  try {
    await previous;
    return await task();
  } finally {
    release();
    if (tails.get(reportId) === done) {
      tails.delete(reportId);
    }
  }
}
