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

    expect(onSave).toHaveBeenCalledWith("updated");
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

    expect(onSave).toHaveBeenCalledWith("latest");
    expect(result.current.status).toBe("saved");
  });
});
