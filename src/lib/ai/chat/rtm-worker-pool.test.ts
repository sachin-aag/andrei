import { describe, expect, it } from "vitest";
import {
  RTM_WORKER_CONCURRENCY,
  withRtmDraftLock,
  withRtmWorkerSlot,
} from "./rtm-worker-pool";

describe("withRtmWorkerSlot", () => {
  it("caps inflight workers at RTM_WORKER_CONCURRENCY", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const jobs = Array.from({ length: RTM_WORKER_CONCURRENCY + 3 }, () =>
      withRtmWorkerSlot(async () => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await Promise.resolve();
        inflight -= 1;
      })
    );
    await Promise.all(jobs);
    expect(maxInflight).toBe(RTM_WORKER_CONCURRENCY);
  });
});

describe("withRtmDraftLock", () => {
  it("runs the same section one at a time", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = withRtmDraftLock("report-a", "qsr_rtm_process", async () => {
      order.push("first-start");
      await firstGate;
      order.push("first-end");
    });
    const second = withRtmDraftLock("report-a", "qsr_rtm_process", async () => {
      order.push("second");
    });
    await Promise.resolve();
    expect(order).toEqual(["first-start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("does not serialize different sections", async () => {
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const started: string[] = [];
    const first = withRtmDraftLock("report-a", "qsr_rtm_process", async () => {
      started.push("process");
      await gateA;
    });
    const second = withRtmDraftLock("report-a", "qsr_rtm_control", async () => {
      started.push("control");
    });
    await Promise.resolve();
    expect(started).toContain("process");
    expect(started).toContain("control");
    releaseA();
    await Promise.all([first, second]);
  });
});
