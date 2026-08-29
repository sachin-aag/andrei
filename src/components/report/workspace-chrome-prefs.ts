import {
  isWorkspaceChrome,
  type WorkspaceChrome,
} from "./workspace-chrome";

/**
 * Document | Agent chrome for a logged-in user on one report.
 * Survives refresh and later sessions in this browser so the layout
 * does not snap back to Document after a reload.
 */
export const WORKSPACE_CHROME_STORAGE_PREFIX = "workspaceChrome:v1";

export const DEFAULT_WORKSPACE_CHROME: WorkspaceChrome = "document";

const memory = new Map<string, WorkspaceChrome>();
const listeners = new Set<() => void>();

function notifyWorkspaceChromeListeners() {
  for (const listener of listeners) listener();
}

export function subscribeWorkspaceChromePrefs(
  onStoreChange: () => void
): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function workspaceChromeStorageKey(
  userId: string,
  reportId: string
): string {
  return `${WORKSPACE_CHROME_STORAGE_PREFIX}:${userId}:${reportId}`;
}

/** Test helper — module cache otherwise leaks across cases. */
export function resetWorkspaceChromePrefsStore(): void {
  memory.clear();
  notifyWorkspaceChromeListeners();
}

function readFromLocalStorage(key: string): WorkspaceChrome | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    return isWorkspaceChrome(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeToLocalStorage(key: string, chrome: WorkspaceChrome): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, chrome);
  } catch {
    // Incognito / quota / disabled storage — memory still holds the choice.
  }
}

export function readWorkspaceChrome(
  userId: string,
  reportId: string
): WorkspaceChrome {
  const key = workspaceChromeStorageKey(userId, reportId);
  const cached = memory.get(key);
  if (cached) return cached;
  const stored = readFromLocalStorage(key);
  if (stored) {
    memory.set(key, stored);
    return stored;
  }
  return DEFAULT_WORKSPACE_CHROME;
}

export function writeWorkspaceChrome(
  userId: string,
  reportId: string,
  chrome: WorkspaceChrome
): void {
  const key = workspaceChromeStorageKey(userId, reportId);
  memory.set(key, chrome);
  writeToLocalStorage(key, chrome);
  notifyWorkspaceChromeListeners();
}
