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
  nowHidden: () => boolean;
  notificationPermission: () => NotificationPermissionState;
  notifySystem: (title: string, body: string) => void;
  notifyInApp: (title: string, body: string) => void;
  playSound: () => void;
};

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

export function shouldAnnounceAgentDone(opts: {
  isAbort?: boolean;
  isDisconnect?: boolean;
  isError?: boolean;
  emptyAssistant?: boolean;
}): boolean {
  return (
    !opts.isAbort &&
    !opts.isDisconnect &&
    !opts.isError &&
    !opts.emptyAssistant
  );
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
  nowHidden: () =>
    typeof document !== "undefined" ? document.hidden : false,
  notificationPermission: readNotificationPermission,
  notifySystem: showSystemAgentDoneNotification,
  notifyInApp: showInAppAgentDoneNotice,
  playSound: playAgentDoneSound,
};

/**
 * Fire the two independent channels. Sound plays even when notifications
 * are off; a silent system banner is used only when the tab is hidden and
 * permission is granted.
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
    resolved.nowHidden()
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
