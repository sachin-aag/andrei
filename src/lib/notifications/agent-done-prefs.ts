/**
 * Per-user, per-browser prefs for announcing when the Assistant finishes a
 * turn. Notifications and sound are independent: the default is a silent
 * desktop/in-app notice with no chime.
 */
export const AGENT_DONE_PREFS_STORAGE_PREFIX = "agentDonePrefs:v1";

export type AgentDonePrefs = {
  notifications: boolean;
  sound: boolean;
};

export const DEFAULT_AGENT_DONE_PREFS: AgentDonePrefs = {
  notifications: true,
  sound: false,
};

const memory = new Map<string, AgentDonePrefs>();

export function agentDonePrefsStorageKey(userId: string): string {
  return `${AGENT_DONE_PREFS_STORAGE_PREFIX}:${userId}`;
}

export function parseAgentDonePrefs(raw: unknown): AgentDonePrefs | null {
  if (typeof raw !== "object" || raw === null) return null;
  const notifications = (raw as { notifications?: unknown }).notifications;
  const sound = (raw as { sound?: unknown }).sound;
  if (typeof notifications !== "boolean" || typeof sound !== "boolean") {
    return null;
  }
  return { notifications, sound };
}

/** Test helper — module cache otherwise leaks across cases. */
export function resetAgentDonePrefsStore(): void {
  memory.clear();
}

function readFromLocalStorage(key: string): AgentDonePrefs | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return parseAgentDonePrefs(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeToLocalStorage(key: string, prefs: AgentDonePrefs): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // Incognito / quota / disabled storage — memory still holds the choice.
  }
}

export function readAgentDonePrefs(userId: string): AgentDonePrefs {
  const key = agentDonePrefsStorageKey(userId);
  const cached = memory.get(key);
  if (cached) return cached;
  const stored = readFromLocalStorage(key);
  if (stored) {
    memory.set(key, stored);
    return stored;
  }
  return DEFAULT_AGENT_DONE_PREFS;
}

export function writeAgentDonePrefs(
  userId: string,
  prefs: AgentDonePrefs
): void {
  const key = agentDonePrefsStorageKey(userId);
  memory.set(key, prefs);
  writeToLocalStorage(key, prefs);
}
