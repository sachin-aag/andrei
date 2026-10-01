// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdentityFormSave } from "@/hooks/use-identity-form-save";
import { CHAT_IDENTITY_SECTION } from "@/lib/ai/chat/identity";

const pauseState = vi.hoisted(() => ({ paused: false }));
const flushState = vi.hoisted(() => ({
  registerSectionFlush: vi.fn(() => () => {}),
}));

vi.mock("@/components/report/identity-suggestion-field", () => ({
  useIdentitySavePaused: () => pauseState.paused,
}));

vi.mock("@/providers/report-provider", () => ({
  useReportData: () => ({
    registerSectionFlush: flushState.registerSectionFlush,
  }),
}));

type IdentityValue = { documentNo: string; meta: { cycleNo: string } };

describe("useIdentityFormSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pauseState.paused = false;
    flushState.registerSectionFlush.mockClear();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ report: { updatedAt: "2026-10-01T15:00:01.000Z" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps typed identity when a stale GET snapshot arrives", () => {
    const applyToReport = vi.fn();
    const { result, rerender } = renderHook(
      ({ incoming, reportUpdatedAt }: { incoming: IdentityValue; reportUpdatedAt: string }) =>
        useIdentityFormSave({
          reportId: "r1",
          reportUpdatedAt,
          readOnly: false,
          incoming,
          toPatch: (v) => ({ documentNo: v.documentNo, metadata: v.meta }),
          applyToReport,
        }),
      {
        initialProps: {
          incoming: { documentNo: "ELR-PR-001", meta: { cycleNo: "" } },
          reportUpdatedAt: "2026-10-01T15:00:00.000Z",
        },
      }
    );

    act(() => {
      result.current.update((prev) => ({
        ...prev,
        meta: { ...prev.meta, cycleNo: "01" },
      }));
    });
    expect(result.current.value.meta.cycleNo).toBe("01");

    rerender({
      incoming: { documentNo: "ELR-PR-001", meta: { cycleNo: "" } },
      reportUpdatedAt: "2026-10-01T15:00:00.000Z",
    });

    expect(result.current.value.meta.cycleNo).toBe("01");
    expect(applyToReport).toHaveBeenLastCalledWith({
      documentNo: "ELR-PR-001",
      meta: { cycleNo: "01" },
    });
  });

  it("hydrates Apply values while the identity card pause is still on", () => {
    pauseState.paused = true;
    const applyToReport = vi.fn();
    const { result, rerender } = renderHook(
      ({ incoming, reportUpdatedAt }: { incoming: IdentityValue; reportUpdatedAt: string }) =>
        useIdentityFormSave({
          reportId: "r1",
          reportUpdatedAt,
          readOnly: false,
          incoming,
          toPatch: (v) => ({ documentNo: v.documentNo, metadata: v.meta }),
          applyToReport,
        }),
      {
        initialProps: {
          incoming: { documentNo: "ELR-PR-001", meta: { cycleNo: "" } },
          reportUpdatedAt: "2026-10-01T15:00:00.000Z",
        },
      }
    );

    rerender({
      incoming: { documentNo: "ELR-PR-001", meta: { cycleNo: "02" } },
      reportUpdatedAt: "2026-10-01T15:00:02.000Z",
    });

    expect(result.current.value.meta.cycleNo).toBe("02");
  });

  it("keeps applied identity when a stale GET arrives after Apply", () => {
    pauseState.paused = true;
    const applyToReport = vi.fn();
    const { result, rerender } = renderHook(
      ({ incoming, reportUpdatedAt }: { incoming: IdentityValue; reportUpdatedAt: string }) =>
        useIdentityFormSave({
          reportId: "r1",
          reportUpdatedAt,
          readOnly: false,
          incoming,
          toPatch: (v) => ({ documentNo: v.documentNo, metadata: v.meta }),
          applyToReport,
        }),
      {
        initialProps: {
          incoming: { documentNo: "ELR-PR-001", meta: { cycleNo: "" } },
          reportUpdatedAt: "2026-10-01T15:00:00.000Z",
        },
      }
    );

    rerender({
      incoming: {
        documentNo: "ELR-PR-001",
        meta: { cycleNo: "01/04/2025" },
      },
      reportUpdatedAt: "2026-10-01T15:00:02.000Z",
    });
    expect(result.current.value.meta.cycleNo).toBe("01/04/2025");

    pauseState.paused = false;
    rerender({
      incoming: { documentNo: "ELR-PR-001", meta: { cycleNo: "" } },
      reportUpdatedAt: "2026-10-01T15:00:00.000Z",
    });

    expect(result.current.value.meta.cycleNo).toBe("01/04/2025");
    expect(applyToReport).toHaveBeenLastCalledWith({
      documentNo: "ELR-PR-001",
      meta: { cycleNo: "01/04/2025" },
    });
  });

  it("registers identity flush so chat refresh persists the header first", () => {
    const applyToReport = vi.fn();
    renderHook(() =>
      useIdentityFormSave({
        reportId: "r1",
        reportUpdatedAt: "2026-10-01T15:00:00.000Z",
        readOnly: false,
        incoming: { documentNo: "", meta: { cycleNo: "" } },
        toPatch: (v) => ({ documentNo: v.documentNo, metadata: v.meta }),
        applyToReport,
      })
    );

    expect(flushState.registerSectionFlush).toHaveBeenCalledWith(
      CHAT_IDENTITY_SECTION,
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("does not persist a keystroke until the debounce elapses", async () => {
    const applyToReport = vi.fn();
    const { result } = renderHook(() =>
      useIdentityFormSave({
        reportId: "r1",
        reportUpdatedAt: "2026-10-01T15:00:00.000Z",
        readOnly: false,
        incoming: { documentNo: "", meta: { cycleNo: "" } },
        toPatch: (v) => ({ documentNo: v.documentNo, metadata: v.meta }),
        applyToReport,
      })
    );

    act(() => {
      result.current.update((prev) => ({
        ...prev,
        meta: { cycleNo: "01" },
      }));
    });
    expect(result.current.status).toBe("saving");
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/reports/r1",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("PATCHes when a persisted identity character is deleted", async () => {
    const applyToReport = vi.fn();
    const { result, rerender } = renderHook(
      ({ incoming, reportUpdatedAt }: { incoming: IdentityValue; reportUpdatedAt: string }) =>
        useIdentityFormSave({
          reportId: "r1",
          reportUpdatedAt,
          readOnly: false,
          incoming,
          toPatch: (v) => ({ documentNo: v.documentNo, metadata: v.meta }),
          applyToReport,
        }),
      {
        initialProps: {
          incoming: { documentNo: "ELR-PR-001", meta: { cycleNo: "01" } },
          reportUpdatedAt: "2026-10-01T15:00:00.000Z",
        },
      }
    );

    act(() => {
      result.current.update((prev) => ({
        ...prev,
        meta: { cycleNo: "0" },
      }));
    });
    rerender({
      incoming: { documentNo: "ELR-PR-001", meta: { cycleNo: "0" } },
      reportUpdatedAt: "2026-10-01T15:00:00.000Z",
    });

    expect(result.current.status).toBe("saving");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/reports/r1",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(JSON.parse(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]?.body))).toMatchObject({
      metadata: { cycleNo: "0" },
    });
  });

  it("PATCHes a deleted character after Apply hydrates the header", async () => {
    const applyToReport = vi.fn();
    const { result, rerender } = renderHook(
      ({ incoming, reportUpdatedAt }: { incoming: IdentityValue; reportUpdatedAt: string }) =>
        useIdentityFormSave({
          reportId: "r1",
          reportUpdatedAt,
          readOnly: false,
          incoming,
          toPatch: (v) => ({ documentNo: v.documentNo, metadata: v.meta }),
          applyToReport,
        }),
      {
        initialProps: {
          incoming: { documentNo: "ELR-PR-001", meta: { cycleNo: "" } },
          reportUpdatedAt: "2026-10-01T15:00:00.000Z",
        },
      }
    );

    rerender({
      incoming: {
        documentNo: "ELR-PR-001",
        meta: { cycleNo: "01/04/2025" },
      },
      reportUpdatedAt: "2026-10-01T15:00:02.000Z",
    });
    expect(result.current.value.meta.cycleNo).toBe("01/04/2025");

    act(() => {
      result.current.update((prev) => ({
        ...prev,
        meta: { cycleNo: "01/04/202" },
      }));
    });
    rerender({
      incoming: {
        documentNo: "ELR-PR-001",
        meta: { cycleNo: "01/04/202" },
      },
      reportUpdatedAt: "2026-10-01T15:00:02.000Z",
    });

    expect(result.current.status).toBe("saving");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(JSON.parse(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]?.body))).toMatchObject({
      metadata: { cycleNo: "01/04/202" },
    });
  });

  it("PATCHes a same-clock truncated snapshot that never went through update()", async () => {
    const applyToReport = vi.fn();
    const { result, rerender } = renderHook(
      ({ incoming, reportUpdatedAt }: { incoming: IdentityValue; reportUpdatedAt: string }) =>
        useIdentityFormSave({
          reportId: "r1",
          reportUpdatedAt,
          readOnly: false,
          incoming,
          toPatch: (v) => ({ documentNo: v.documentNo, metadata: v.meta }),
          applyToReport,
        }),
      {
        initialProps: {
          incoming: { documentNo: "ELR-PR-001", meta: { cycleNo: "" } },
          reportUpdatedAt: "2026-10-01T15:00:00.000Z",
        },
      }
    );

    rerender({
      incoming: {
        documentNo: "ELR-PR-001",
        meta: { cycleNo: "01/04/2025" },
      },
      reportUpdatedAt: "2026-10-01T15:00:02.000Z",
    });
    expect(result.current.value.meta.cycleNo).toBe("01/04/2025");

    rerender({
      incoming: {
        documentNo: "ELR-PR-001",
        meta: { cycleNo: "01/04/202" },
      },
      reportUpdatedAt: "2026-10-01T15:00:02.000Z",
    });

    expect(result.current.value.meta.cycleNo).toBe("01/04/202");
    expect(result.current.status).toBe("saving");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(JSON.parse(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]?.body))).toMatchObject({
      metadata: { cycleNo: "01/04/202" },
    });
  });
});
