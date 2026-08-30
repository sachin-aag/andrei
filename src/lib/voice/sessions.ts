import { randomUUID } from "node:crypto";
import { voiceInputLanguageCodes } from "@/lib/customers";
import { isTestStubSpeech } from "@/lib/test/ai-bypass";
import { VOICE_MAX_DURATION_MS } from "@/lib/voice/constants";
import type { VoiceSseEvent } from "@/lib/voice/events";
import {
  openSpeechRecognizeStream,
  type SpeechStream,
} from "@/lib/voice/speech-stream";
import { streamStubVoiceEvents } from "@/lib/voice/stub-stream";

export type VoiceSession = {
  id: string;
  reportId: string;
  userId: string;
  speech: SpeechStream | null;
  listeners: Set<(event: VoiceSseEvent) => void>;
  history: VoiceSseEvent[];
  abort: AbortController;
  closed: boolean;
};

const SESSION_TTL_MS = 60_000;

const globalForSessions = globalThis as {
  __andreiVoiceSessions?: Map<string, VoiceSession>;
};

export const voiceSessions: Map<string, VoiceSession> =
  globalForSessions.__andreiVoiceSessions ??
  (globalForSessions.__andreiVoiceSessions = new Map());

function emit(session: VoiceSession, event: VoiceSseEvent): void {
  session.history.push(event);
  for (const listener of [...session.listeners]) {
    try {
      listener(event);
    } catch {
      session.listeners.delete(listener);
    }
  }
}

function hasDone(session: VoiceSession): boolean {
  return session.history.some((event) => event.type === "done");
}

function closeSession(session: VoiceSession): void {
  if (session.closed) return;
  session.closed = true;
  session.abort.abort();
  try {
    session.speech?.end();
  } catch {
    /* already ended */
  }
  setTimeout(() => {
    voiceSessions.delete(session.id);
  }, SESSION_TTL_MS);
}

function finish(session: VoiceSession): void {
  if (!hasDone(session)) {
    emit(session, { type: "done" });
  }
  closeSession(session);
}

export function getVoiceSession(
  id: string,
  reportId: string,
  userId: string
): VoiceSession | null {
  const session = voiceSessions.get(id);
  if (!session) return null;
  if (session.reportId !== reportId || session.userId !== userId) return null;
  return session;
}

async function runStub(session: VoiceSession): Promise<void> {
  try {
    await streamStubVoiceEvents(
      (event) => emit(session, event),
      (ms) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, ms);
          session.abort.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("aborted"));
            },
            { once: true }
          );
        })
    );
  } catch {
    /* max-duration abort — still emit done below */
  } finally {
    finish(session);
  }
}

export function createVoiceSession(reportId: string, userId: string): VoiceSession {
  const session: VoiceSession = {
    id: randomUUID(),
    reportId,
    userId,
    speech: null,
    listeners: new Set(),
    history: [],
    abort: new AbortController(),
    closed: false,
  };
  voiceSessions.set(session.id, session);

  if (isTestStubSpeech()) {
    void runStub(session);
  } else {
    session.speech = openSpeechRecognizeStream({
      languageCodes: voiceInputLanguageCodes(),
      onTranscript: (event) => emit(session, event),
      onError: (error) => {
        emit(session, { type: "error", message: error.message });
        finish(session);
      },
      onEnd: () => finish(session),
    });
  }

  setTimeout(() => {
    if (!session.closed) {
      session.abort.abort();
      try {
        session.speech?.end();
      } catch {
        /* already ended */
      }
    }
  }, VOICE_MAX_DURATION_MS);

  return session;
}

export function writeVoiceAudio(session: VoiceSession, chunk: Uint8Array): void {
  if (session.closed || isTestStubSpeech()) return;
  session.speech?.writeAudio(chunk);
}

/** Ends Chirp 3. Stub sessions keep running so the canned transcript still lands. */
export function stopVoiceSession(session: VoiceSession): void {
  if (session.closed || isTestStubSpeech()) return;
  try {
    session.speech?.end();
  } catch {
    /* already ended */
  }
}

export function subscribeVoiceSession(
  session: VoiceSession,
  listener: (event: VoiceSseEvent) => void
): () => void {
  for (const event of session.history) {
    listener(event);
  }
  if (session.closed || hasDone(session)) {
    return () => undefined;
  }
  session.listeners.add(listener);
  return () => {
    session.listeners.delete(listener);
  };
}
