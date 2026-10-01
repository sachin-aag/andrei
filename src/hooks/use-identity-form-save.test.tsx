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

  it("hydrates Apply values once the identity card pause lifts", () => {
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

    pauseState.paused = false;
    rerender({
      incoming: { documentNo: "ELR-PR-001", meta: { cycleNo: "02" } },
      reportUpdatedAt: "2026-10-01T15:00:02.000Z",
    });

    expect(result.current.value.meta.cycleNo).toBe("02");
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
});
