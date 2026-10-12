/**
 * Chat persist / onFinishTurn refresh the whole report bundle. Apply all and
 * Dismiss all write sections and comment statuses first, then update local
 * state. A GET that was already in flight (or served from a stale snapshot)
 * can put those comments back to `open` while the editor still shows the
 * applied wording — Apply all stays, and Dismiss looks like a no-op.
 */

export type WorkspaceRefreshComment = {
  id: string;
  status?: string;
};

export type WorkspaceRefreshDecision<T extends WorkspaceRefreshComment> =
  | { action: "discard" }
  | { action: "apply-bundle"; comments: T[] }
  | { action: "keep-local"; newComments: T[] };

export function createWorkspaceRefreshGuard() {
  let writeEpoch = 0;
  const closedIds = new Set<string>();

  return {
    closeComments(ids: readonly string[]) {
      if (ids.length === 0) return;
      writeEpoch += 1;
      for (const id of ids) closedIds.add(id);
    },
    releaseComments(ids: readonly string[]) {
      if (ids.length === 0) return;
      writeEpoch += 1;
      for (const id of ids) closedIds.delete(id);
    },
    beginRefresh() {
      return writeEpoch;
    },
    decideRefresh<T extends WorkspaceRefreshComment>(
      epoch: number,
      comments: readonly T[]
    ): WorkspaceRefreshDecision<T> {
      if (epoch !== writeEpoch) return { action: "discard" };
      const staleEcho = comments.some(
        (row) => closedIds.has(row.id) && row.status === "open"
      );
      const visible = comments.filter((row) => !closedIds.has(row.id));
      if (staleEcho) {
        return { action: "keep-local", newComments: visible };
      }
      for (const id of [...closedIds]) {
        const row = comments.find((comment) => comment.id === id);
        if (!row || row.status !== "open") closedIds.delete(id);
      }
      return { action: "apply-bundle", comments: visible };
    },
  };
}

export function mergeNewRefreshComments<T extends { id: string }>(
  previous: readonly T[],
  incoming: readonly T[]
): T[] {
  if (incoming.length === 0) return [...previous];
  const seen = new Set(previous.map((row) => row.id));
  const added = incoming.filter((row) => !seen.has(row.id));
  return added.length > 0 ? [...previous, ...added] : [...previous];
}
