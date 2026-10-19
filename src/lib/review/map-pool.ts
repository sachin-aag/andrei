export async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing: Promise<void>[] = [];
  for (const item of items) {
    const task = Promise.resolve().then(() => fn(item));
    executing.push(task);
    const drop = task.then(() => {
      executing.splice(executing.indexOf(task), 1);
    });
    void drop;
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}
