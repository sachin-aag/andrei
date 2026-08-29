import { isChatMode, type ChatMode } from "@/lib/ai/chat/system-prompt";
import { DEFAULT_CHAT_PACE, isChatPace, type ChatPace } from "@/lib/ai/chat/pace";
import {
  isWorkProductView,
  type WorkProductView,
} from "@/components/report/workspace-chrome";

/**
 * Composer Ask/Agent + Quick/Deep for a logged-in user on one report.
 * Survives panel remounts (sidebar tab, collapse, refresh) so a Deep
 * (or Ask) choice is not snapped back to the defaults after a turn.
 */
export const CHAT_COMPOSER_PREFS_STORAGE_PREFIX = "chatComposerPrefs:v1";

export type ChatComposerPrefs = {
  mode: ChatMode;
  pace: ChatPace;
  /** Agent-chrome Report | Analytics target. Document chrome ignores this.
   *  Seeded from the focused pane when switching Document → Agent. */
  chatTarget?: WorkProductView;
};

export const DEFAULT_CHAT_COMPOSER_PREFS: ChatComposerPrefs = {
  mode: "agent",
  pace: DEFAULT_CHAT_PACE,
};

/** Radix Select can emit "" when a controlled value remounts; never persist that. */
export function coerceChatMode(value: unknown): ChatMode {
  return isChatMode(value) ? value : DEFAULT_CHAT_COMPOSER_PREFS.mode;
}

export function coerceChatPace(value: unknown): ChatPace {
  return isChatPace(value) ? value : DEFAULT_CHAT_COMPOSER_PREFS.pace;
}

const memory = new Map<string, ChatComposerPrefs>();
const listeners = new Set<() => void>();

function notifyChatComposerPrefsListeners() {
  for (const listener of listeners) listener();
}

export function subscribeChatComposerPrefs(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function chatComposerPrefsStorageKey(
  userId: string,
  reportId: string
): string {
  return `${CHAT_COMPOSER_PREFS_STORAGE_PREFIX}:${userId}:${reportId}`;
}

export function parseChatComposerPrefs(raw: unknown): ChatComposerPrefs | null {
  if (typeof raw !== "object" || raw === null) return null;
  const mode = (raw as { mode?: unknown }).mode;
  const pace = (raw as { pace?: unknown }).pace;
  if (!isChatMode(mode) || !isChatPace(pace)) return null;
  const chatTarget = (raw as { chatTarget?: unknown }).chatTarget;
  return {
    mode,
    pace,
    ...(isWorkProductView(chatTarget) ? { chatTarget } : {}),
  };
}

/** Test helper — module cache otherwise leaks across cases. */
export function resetChatComposerPrefsStore(): void {
  memory.clear();
  notifyChatComposerPrefsListeners();
}

function readFromLocalStorage(key: string): ChatComposerPrefs | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return parseChatComposerPrefs(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeToLocalStorage(key: string, prefs: ChatComposerPrefs): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // Incognito / quota / disabled storage — memory still holds the choice.
  }
}

export function readChatComposerPrefs(
  userId: string,
  reportId: string
): ChatComposerPrefs {
  const key = chatComposerPrefsStorageKey(userId, reportId);
  const cached = memory.get(key);
  if (cached) return cached;
  const stored = readFromLocalStorage(key);
  if (stored) {
    memory.set(key, stored);
    return stored;
  }
  return DEFAULT_CHAT_COMPOSER_PREFS;
}

export function writeChatComposerPrefs(
  userId: string,
  reportId: string,
  prefs: ChatComposerPrefs
): void {
  const key = chatComposerPrefsStorageKey(userId, reportId);
  memory.set(key, prefs);
  writeToLocalStorage(key, prefs);
  notifyChatComposerPrefsListeners();
}
