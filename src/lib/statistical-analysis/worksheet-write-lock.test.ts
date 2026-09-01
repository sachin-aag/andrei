import { describe, expect, it } from "vitest";
import { withWorksheetMutationLock } from "./worksheet-write-lock";

describe("withWorksheetMutationLock", () => {
  it("runs tasks for the same report in start-to-finish order", async () => {
    const events: string[] = [];
    let proceed!: () => void;
    const gate = new Promise<void>((resolve) => {
      proceed = resolve;
    });

    const first = withWorksheetMutationLock("report-a", async () => {
      events.push("1-start");
      await gate;
      events.push("1-end");
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["1-start"]);

    const second = withWorksheetMutationLock("report-a", async () => {
      events.push("2");
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["1-start"]);

    proceed();
    await Promise.all([first, second]);
    expect(events).toEqual(["1-start", "1-end", "2"]);
  });

  it("does not block a different report", async () => {
    const events: string[] = [];
    let proceed!: () => void;
    const gate = new Promise<void>((resolve) => {
      proceed = resolve;
    });

    const first = withWorksheetMutationLock("report-a", async () => {
      events.push("a-start");
      await gate;
      events.push("a-end");
    });
    await Promise.resolve();
    await Promise.resolve();

    const second = withWorksheetMutationLock("report-b", async () => {
      events.push("b");
    });
    await second;
    expect(events).toEqual(["a-start", "b"]);

    proceed();
    await first;
    expect(events).toEqual(["a-start", "b", "a-end"]);
  });
});
