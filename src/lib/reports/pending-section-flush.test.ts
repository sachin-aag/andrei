import { describe, expect, it, vi } from "vitest";
import { planPendingSectionFlush } from "@/lib/reports/pending-section-flush";

describe("planPendingSectionFlush", () => {
  it("skips when no editor is dirty and no section needs a flush", () => {
    const sync = vi.fn();
    const flush = vi.fn(async () => undefined);

    expect(
      planPendingSectionFlush({
        liveEditors: [
          { section: "elr_objective", sync, isDirty: () => false },
        ],
        sections: [
          { section: "elr_objective", flush, needsFlush: () => false },
        ],
      })
    ).toEqual({ skip: true });
  });

  it("syncs only dirty editors and flushes their sections", () => {
    const dirtySync = vi.fn();
    const cleanSync = vi.fn();
    const dirtyFlush = vi.fn(async () => undefined);
    const cleanFlush = vi.fn(async () => undefined);

    const plan = planPendingSectionFlush({
      liveEditors: [
        { section: "elr_objective", sync: dirtySync, isDirty: () => true },
        { section: "elr_scope", sync: cleanSync, isDirty: () => false },
      ],
      sections: [
        { section: "elr_objective", flush: dirtyFlush, needsFlush: () => false },
        { section: "elr_scope", flush: cleanFlush, needsFlush: () => false },
      ],
    });

    expect(plan.skip).toBe(false);
    if (plan.skip) return;
    expect(plan.editorsToSync).toEqual([dirtySync]);
    expect(plan.sectionsToFlush).toEqual([dirtyFlush]);
  });

  it("flushes a section with a pending autosave even when its editor is clean", () => {
    const sync = vi.fn();
    const flush = vi.fn(async () => undefined);

    const plan = planPendingSectionFlush({
      liveEditors: [
        { section: "define", sync, isDirty: () => false },
      ],
      sections: [
        { section: "define", flush, needsFlush: () => true },
      ],
    });

    expect(plan.skip).toBe(false);
    if (plan.skip) return;
    expect(plan.editorsToSync).toEqual([]);
    expect(plan.sectionsToFlush).toEqual([flush]);
  });
});
