import { describe, expect, it, vi } from "vitest";
import { drainSseStream } from "./background-turn";

vi.mock("@/db", () => ({
  db: {},
}));

describe("drainSseStream", () => {
  it("reads the stream to completion", async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("data: one\n\n");
        controller.enqueue("data: [DONE]\n\n");
        controller.close();
      },
    });
    await expect(drainSseStream(stream)).resolves.toBeUndefined();
  });

  it("swallows a mid-stream cancel from the other tee branch", async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("data: one\n\n");
        controller.error(new Error("client disconnected"));
      },
    });
    await expect(drainSseStream(stream)).resolves.toBeUndefined();
  });
});
