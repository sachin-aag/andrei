// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoSave } from "@/hooks/use-auto-save";

describe("useAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not save the initial value", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderHook(({ value }) => useAutoSave({ value, onSave, delayMs: 100 }), {
      initialProps: { value: "initial" },
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves changed values after the debounce delay", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender, result } = renderHook(
      ({ value }) => useAutoSave({ value, onSave, delayMs: 100 }),
      { initialProps: { value: "initial" } },
    );

    rerender({ value: "updated" });
    expect(result.current.status).toBe("saving");

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(onSave).toHaveBeenCalledWith(
      "updated",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(result.current.status).toBe("saved");
    expect(result.current.lastSavedAt).toBeInstanceOf(Date);
  });

  it("flushes the latest value immediately", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender, result } = renderHook(
      ({ value }) => useAutoSave({ value, onSave, delayMs: 1_000 }),
      { initialProps: { value: "initial" } },
    );

    rerender({ value: "latest" });

    await act(async () => {
      await result.current.flush();
    });

    expect(onSave).toHaveBeenCalledWith("latest", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(result.current.status).toBe("saved");
  });

  it("does not log or set error when unmount aborts an in-flight save", async () => {
    let rejectSave: ((err: DOMException) => void) | undefined;
    const onSave = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectSave = reject;
        })
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender, unmount } = renderHook(
      ({ value }) => useAutoSave({ value, onSave, delayMs: 1_000 }),
      { initialProps: { value: "initial" } },
    );

    rerender({ value: "updated" });
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    unmount();
    await act(async () => {
      rejectSave?.(new DOMException("Aborted", "AbortError"));
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
