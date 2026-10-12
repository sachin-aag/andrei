import { describe, expect, it } from "vitest";
import {
  createWorkspaceRefreshGuard,
  mergeNewRefreshComments,
} from "./workspace-refresh-guard";

describe("createWorkspaceRefreshGuard", () => {
  it("discards a refresh that started before Apply all closed comments", () => {
    const guard = createWorkspaceRefreshGuard();
    const epoch = guard.beginRefresh();
    guard.closeComments(["c1", "c2"]);

    expect(
      guard.decideRefresh(epoch, [
        { id: "c1", status: "open" },
        { id: "c2", status: "open" },
      ])
    ).toEqual({ action: "discard" });
  });

  it("keeps local apply/dismiss when a later GET still lists those cards as open", () => {
    const guard = createWorkspaceRefreshGuard();
    guard.closeComments(["c1"]);
    const epoch = guard.beginRefresh();

    expect(
      guard.decideRefresh(epoch, [
        { id: "c1", status: "open" },
        { id: "c-new", status: "open" },
      ])
    ).toEqual({
      action: "keep-local",
      newComments: [{ id: "c-new", status: "open" }],
    });
  });

  it("applies a fresh bundle once the server has dropped the closed cards", () => {
    const guard = createWorkspaceRefreshGuard();
    guard.closeComments(["c1"]);
    const epoch = guard.beginRefresh();

    expect(
      guard.decideRefresh(epoch, [
        { id: "human-1", status: "open" },
      ])
    ).toEqual({
      action: "apply-bundle",
      comments: [{ id: "human-1", status: "open" }],
    });
  });

  it("lets a leftover skip reappear after release", () => {
    const guard = createWorkspaceRefreshGuard();
    guard.closeComments(["applied", "skipped"]);
    guard.releaseComments(["skipped"]);
    const epoch = guard.beginRefresh();

    expect(
      guard.decideRefresh(epoch, [
        { id: "applied", status: "open" },
        { id: "skipped", status: "open" },
      ])
    ).toEqual({
      action: "keep-local",
      newComments: [{ id: "skipped", status: "open" }],
    });
  });

  it("accepts a skip that the server still has after release", () => {
    const guard = createWorkspaceRefreshGuard();
    guard.closeComments(["applied", "skipped"]);
    guard.releaseComments(["skipped"]);
    const epoch = guard.beginRefresh();

    expect(
      guard.decideRefresh(epoch, [{ id: "skipped", status: "open" }])
    ).toEqual({
      action: "apply-bundle",
      comments: [{ id: "skipped", status: "open" }],
    });
  });
});

describe("mergeNewRefreshComments", () => {
  it("appends only comments the local list does not already have", () => {
    expect(
      mergeNewRefreshComments(
        [{ id: "local" }, { id: "shared" }],
        [{ id: "shared" }, { id: "fresh" }]
      )
    ).toEqual([{ id: "local" }, { id: "shared" }, { id: "fresh" }]);
  });

  it("returns the previous list when nothing new arrived", () => {
    const previous = [{ id: "local" }];
    expect(mergeNewRefreshComments(previous, [{ id: "local" }])).toEqual(
      previous
    );
  });
});
