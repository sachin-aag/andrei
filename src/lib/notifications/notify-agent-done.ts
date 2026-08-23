import { toast } from "sonner";
import type { AgentDonePrefs } from "./agent-done-prefs";

export type AgentDoneCopy = {
  title: string;
  body: string;
};

export type NotificationPermissionState =
  | NotificationPermission
  | "unsupported";

export type AgentDoneNotifierDeps = {
  pageUnfocused: () => boolean;
  notificationPermission: () => NotificationPermissionState;
  notifySystem: (title: string, body: string) => void;
  notifyInApp: (title: string, body: string) => void;
  playSound: () => void;
};

type PageFocusSnapshot = {
  hidden: boolean;
  visibilityState?: DocumentVisibilityState;
  hasFocus?: () => boolean;
};

/**
 * True when this page is still loaded but the engineer is looking
 * somewhere else — another tab, another browser window, or another app.
 * `document.hidden` alone misses an unfocused window that is still visible.
 */
export function isAgentDonePageUnfocused(
  page: PageFocusSnapshot | null | undefined =
    typeof document === "undefined" ? null : document
): boolean {
  if (!page) return false;
  if (page.hidden) return true;
  if (page.visibilityState && page.visibilityState !== "visible") return true;
  if (typeof page.hasFocus === "function" && !page.hasFocus()) return true;
  return false;
}

let audioContext: AudioContext | null = null;

export function agentDoneNotificationCopy(opts: {
  documentNoun: string;
  documentNo: string;
}): AgentDoneCopy {
  const documentNo = opts.documentNo.trim();
  return {
    title: "Assistant is done",
    body: documentNo
      ? `Finished a reply on ${opts.documentNoun} ${documentNo}.`
      : "The assistant finished its reply.",
  };
}

/** Skip the notice/chime for quick replies the engineer is still watching. */
export const AGENT_DONE_MIN_ELAPSED_MS = 5_000;

export function shouldShowAgentDonePendingHint(opts: {
  notifications: boolean;
  elapsedMs: number;
}): boolean {
  return opts.notifications && opts.elapsedMs >= AGENT_DONE_MIN_ELAPSED_MS;
}

export function shouldAnnounceAgentDone(opts: {
  isAbort?: boolean;
  isDisconnect?: boolean;
  isError?: boolean;
  emptyAssistant?: boolean;
  elapsedMs?: number;
}): boolean {
  if (
    opts.isAbort ||
    opts.isDisconnect ||
    opts.isError ||
    opts.emptyAssistant
  ) {
    return false;
  }
  return (opts.elapsedMs ?? 0) >= AGENT_DONE_MIN_ELAPSED_MS;
}

/** Clock read lives here so chat-panel render stays pure. */
export function elapsedSince(startedAt: number | null, now = Date.now()): number {
  return startedAt == null ? 0 : now - startedAt;
}

export function readNotificationPermission(): NotificationPermissionState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function requestAgentDoneNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    audioContext = new Ctor();
  }
  return audioContext;
}

/** Resume the audio context during a click so a later chime is allowed. */
export function unlockAgentDoneAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
}

export function playAgentDoneSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  void ctx.resume().then(() => {
    const now = ctx.currentTime;
    playTone(ctx, { frequency: 880, start: now, duration: 0.09, gain: 0.08 });
    playTone(ctx, {
      frequency: 1174.7,
      start: now + 0.11,
      duration: 0.16,
      gain: 0.07,
    });
  });
}

function playTone(
  ctx: AudioContext,
  opts: { frequency: number; start: number; duration: number; gain: number }
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(opts.frequency, opts.start);
  gain.gain.setValueAtTime(0.0001, opts.start);
  gain.gain.exponentialRampToValueAtTime(opts.gain, opts.start + 0.015);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    opts.start + opts.duration
  );
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(opts.start);
  oscillator.stop(opts.start + opts.duration + 0.02);
}

export function showSystemAgentDoneNotification(
  title: string,
  body: string
): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, {
      body,
      silent: true,
      tag: "andrei-assistant-done",
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Some embedded browsers reject Notification construction.
  }
}

export function showInAppAgentDoneNotice(title: string, body: string): void {
  toast(title, { description: body });
}

const defaultDeps: AgentDoneNotifierDeps = {
  pageUnfocused: () => isAgentDonePageUnfocused(),
  notificationPermission: readNotificationPermission,
  notifySystem: showSystemAgentDoneNotification,
  notifyInApp: showInAppAgentDoneNotice,
  playSound: playAgentDoneSound,
};

/**
 * Fire the two independent channels. Sound plays even when notifications
 * are off. A silent desktop banner is used when this page is still open
 * but unfocused (another tab or window) and the browser allowed it.
 */
export function notifyAgentDone(
  prefs: AgentDonePrefs,
  copy: AgentDoneCopy,
  deps: Partial<AgentDoneNotifierDeps> = {}
): void {
  const resolved = { ...defaultDeps, ...deps };
  if (prefs.sound) {
    resolved.playSound();
  }
  if (!prefs.notifications) return;
  if (
    resolved.notificationPermission() === "granted" &&
    resolved.pageUnfocused()
  ) {
    resolved.notifySystem(copy.title, copy.body);
    return;
  }
  resolved.notifyInApp(copy.title, copy.body);
}

/** Test helper — drop a cached AudioContext between cases. */
export function resetAgentDoneAudio(): void {
  if (audioContext) {
    void audioContext.close();
    audioContext = null;
  }
}
