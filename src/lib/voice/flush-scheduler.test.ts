import { describe, expect, it, vi } from "vitest";
import { createVoiceFlushScheduler } from "./flush-scheduler";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("createVoiceFlushScheduler", () => {
  it("runs two requests at once and coalesces the rest into one follow-up", async () => {
    const started: boolean[] = [];
    const blocks = [deferred(), deferred(), deferred()];
    let launch = 0;
    const scheduler = createVoiceFlushScheduler({
      maxInFlight: 2,
      run: (force) => {
        started.push(force);
        const current = launch;
        launch += 1;
        return blocks[current]?.promise ?? Promise.resolve();
      },
    });

    scheduler.request(false);
    scheduler.request(false);
    scheduler.request(false);
    scheduler.request(true);
    expect(started).toEqual([false, false]);

    blocks[0]?.resolve();
    await blocks[0]?.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([false, false, true]);

    blocks[1]?.resolve();
    blocks[2]?.resolve();
    await scheduler.whenIdle();
    expect(started).toHaveLength(3);
  });

  it("whenIdle waits until the coalesced follow-up finishes", async () => {
    const first = deferred();
    const follow = deferred();
    let launches = 0;
    const scheduler = createVoiceFlushScheduler({
      maxInFlight: 1,
      run: () => {
        launches += 1;
        return launches === 1 ? first.promise : follow.promise;
      },
    });

    scheduler.request(false);
    scheduler.request(true);
    let idle = false;
    const idleDone = scheduler.whenIdle().then(() => {
      idle = true;
    });

    first.resolve();
    await first.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(launches).toBe(2);
    expect(idle).toBe(false);

    follow.resolve();
    await idleDone;
    expect(idle).toBe(true);
  });

  it("reset drops a coalesced pending flush", async () => {
    const block = deferred();
    const run = vi.fn(() => block.promise);
    const scheduler = createVoiceFlushScheduler({
      maxInFlight: 1,
      run,
    });

    scheduler.request(false);
    scheduler.request(true);
    expect(run).toHaveBeenCalledOnce();
    scheduler.reset();
    block.resolve();
    await scheduler.whenIdle();
    expect(run).toHaveBeenCalledOnce();
  });
});
