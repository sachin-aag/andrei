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

  it("does not save on flush when nothing changed since last persist", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoSave({ value: "initial", onSave, delayMs: 1_000 })
    );

    await act(async () => {
      await result.current.flush();
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("rejects flush when onSave fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("boom"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender, result } = renderHook(
      ({ value }) => useAutoSave({ value, onSave, delayMs: 1_000 }),
      { initialProps: { value: "initial" } },
    );

    rerender({ value: "latest" });

    await act(async () => {
      await expect(result.current.flush()).rejects.toThrow("boom");
    });

    expect(result.current.status).toBe("error");
    consoleError.mockRestore();
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

  it("posts the dirty value on unmount when beaconUrl is set", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { rerender, unmount } = renderHook(
      ({ value }) =>
        useAutoSave({
          value,
          onSave,
          delayMs: 5_000,
          beaconUrl: "/api/reports/r1/sections/define",
          serialize: (v) => JSON.stringify({ content: v }),
        }),
      { initialProps: { value: "initial" } }
    );

    rerender({ value: "dirty-on-leave" });
    unmount();

    expect(onSave).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/reports/r1/sections/define",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        body: JSON.stringify({ content: "dirty-on-leave" }),
      })
    );
    fetchSpy.mockRestore();
  });

  it("does not post on unmount when the value never changed", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { unmount } = renderHook(() =>
      useAutoSave({
        value: "initial",
        onSave,
        delayMs: 5_000,
        beaconUrl: "/api/reports/r1/sections/define",
        serialize: (v) => JSON.stringify({ content: v }),
      })
    );

    unmount();

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("posts the dirty value on pagehide", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { rerender } = renderHook(
      ({ value }) =>
        useAutoSave({
          value,
          onSave,
          delayMs: 5_000,
          beaconUrl: "/api/reports/r1/sections/define",
          serialize: (v) => JSON.stringify({ content: v }),
        }),
      { initialProps: { value: "initial" } }
    );

    rerender({ value: "dirty-pagehide" });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/reports/r1/sections/define",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        body: JSON.stringify({ content: "dirty-pagehide" }),
      })
    );
    fetchSpy.mockRestore();
  });

  it("clears Saving… when disabled with a pending edit, then flushes on re-enable", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender, result } = renderHook(
      ({ value, enabled }) =>
        useAutoSave({ value, onSave, delayMs: 1_000, enabled }),
      { initialProps: { value: "initial", enabled: true } }
    );

    rerender({ value: "dirty", enabled: true });
    expect(result.current.status).toBe("saving");

    rerender({ value: "dirty", enabled: false });
    expect(result.current.status).toBe("idle");
    expect(onSave).not.toHaveBeenCalled();

    rerender({ value: "dirty", enabled: true });
    expect(result.current.status).toBe("saving");

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    expect(onSave).toHaveBeenCalledWith(
      "dirty",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(result.current.status).toBe("saved");
  });

  it("treats onSave's returned snapshot as persisted so a follow-up render does not save again", async () => {
    const onSave = vi.fn().mockResolvedValue("server-copy");
    const { rerender, result } = renderHook(
      ({ value }) => useAutoSave({ value, onSave, delayMs: 100 }),
      { initialProps: { value: "local" } }
    );

    rerender({ value: "local-edit" });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");

    rerender({ value: "server-copy" });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    rerender({ value: "another-edit" });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("markPersisted hydrates a loaded value without saving", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender, result } = renderHook(
      ({ value }) => useAutoSave({ value, onSave, delayMs: 100 }),
      { initialProps: { value: "empty" } }
    );

    act(() => {
      result.current.markPersisted("loaded-from-server");
    });
    rerender({ value: "loaded-from-server" });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it("posts beaconSerialize on pagehide while dirty-checking with serialize", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { rerender } = renderHook(
      ({ value }) =>
        useAutoSave({
          value,
          onSave,
          delayMs: 5_000,
          beaconUrl: "/api/reports/r1/analytics",
          serialize: (worksheet) => JSON.stringify(worksheet),
          beaconSerialize: (worksheet) =>
            JSON.stringify({ worksheet, version: 7 }),
        }),
      { initialProps: { value: { cells: [] as number[] } } }
    );

    rerender({ value: { cells: [1] } });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/reports/r1/analytics",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        body: JSON.stringify({ worksheet: { cells: [1] }, version: 7 }),
      })
    );
    fetchSpy.mockRestore();
  });
});
