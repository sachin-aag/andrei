export const SESSION_HOLD_CHANGED_EVENT = "mjb:session-hold-changed";

const holdIds = new Set<string>();

function emitHoldChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_HOLD_CHANGED_EVENT));
}

export function beginSessionHold(id: string): () => void {
  if (!holdIds.has(id)) {
    holdIds.add(id);
    emitHoldChanged();
  }
  return () => releaseSessionHold(id);
}

export function releaseSessionHold(id: string): void {
  if (!holdIds.has(id)) return;
  holdIds.delete(id);
  emitHoldChanged();
}

export function hasActiveSessionHold(): boolean {
  return holdIds.size > 0;
}

/** Clears module state between tests. */
export function resetSessionHoldsForTests(): void {
  if (holdIds.size === 0) return;
  holdIds.clear();
  emitHoldChanged();
}
