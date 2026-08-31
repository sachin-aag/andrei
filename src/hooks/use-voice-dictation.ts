"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { voiceInputLanguageCodes } from "@/lib/customers";
import {
  VOICE_FLUSH_MS,
  VOICE_MAX_DURATION_MS,
  VOICE_MAX_WINDOW_BYTES,
  VOICE_MIN_WINDOW_BYTES,
  VOICE_PCM_MIME,
} from "@/lib/voice/constants";
import {
  languageCodesForPreference,
  readStoredVoiceLanguage,
} from "@/lib/voice/languages";
import { PCM_CAPTURE_WORKLET } from "@/lib/voice/pcm-worklet";
import {
  applyVoiceTranscript,
  createVoiceTranscriptState,
  voiceComposerValue,
  type VoiceTranscriptState,
} from "@/lib/voice/transcript";
import { voiceUserErrorMessage } from "@/lib/voice/user-error";

export type VoiceDictationStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "stopping";

type Options = {
  reportId: string;
  disabled: boolean;
  getPrefix: () => string;
  onComposerValue: (text: string) => void;
};

function transcribeUrl(reportId: string): string {
  return `/api/reports/${reportId}/chat/transcribe`;
}

function concatBuffers(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function currentLanguageCodes(): readonly string[] {
  const allowed = voiceInputLanguageCodes();
  return languageCodesForPreference(readStoredVoiceLanguage(allowed), allowed);
}

export function useVoiceDictation({
  reportId,
  disabled,
  getPrefix,
  onComposerValue,
}: Options) {
  const [status, setStatus] = useState<VoiceDictationStatus>("idle");
  const [level, setLevel] = useState(0);
  const statusRef = useRef(status);
  statusRef.current = status;

  const getPrefixRef = useRef(getPrefix);
  getPrefixRef.current = getPrefix;
  const onComposerValueRef = useRef(onComposerValue);
  onComposerValueRef.current = onComposerValue;

  const transcriptRef = useRef<VoiceTranscriptState | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<Uint8Array[]>([]);
  const pcmBytesRef = useRef(0);
  const liveRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushChainRef = useRef(Promise.resolve());
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const tearDownAudio = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    workletRef.current?.port.close();
    workletRef.current?.disconnect();
    workletRef.current = null;
    gainRef.current?.disconnect();
    gainRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setLevel(0);
  }, []);

  const stopRef = useRef<() => Promise<void>>(async () => {});

  const publish = useCallback((next: VoiceTranscriptState) => {
    transcriptRef.current = next;
    onComposerValueRef.current(voiceComposerValue(next));
  }, []);

  const commitInterimLocally = useCallback(() => {
    const current = transcriptRef.current;
    if (!current?.interim) return;
    publish(applyVoiceTranscript(current, current.interim, true));
  }, [publish]);

  const fail = useCallback(
    (error: unknown) => {
      toast.error(voiceUserErrorMessage(error));
      void stopRef.current();
    },
    []
  );

  const flushWindow = useCallback(
    async (opts: { force: boolean }) => {
      if (pcmBytesRef.current === 0) {
        if (opts.force) commitInterimLocally();
        return;
      }
      if (!opts.force && pcmBytesRef.current < VOICE_MIN_WINDOW_BYTES) return;

      const pcm = concatBuffers(pcmChunksRef.current);
      if (pcm.byteLength === 0) {
        if (opts.force) commitInterimLocally();
        return;
      }

      try {
        const res = await fetch(transcribeUrl(reportId), {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": VOICE_PCM_MIME,
            "x-voice-languages": currentLanguageCodes().join(","),
          },
          body: pcm,
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          fail(
            payload?.error ?? `Voice transcription failed (${res.status}).`
          );
          return;
        }
        const payload = (await res.json()) as { text?: string };
        const text = payload.text?.trim() ?? "";
        const current = transcriptRef.current;
        if (!current) return;
        if (!text) {
          if (opts.force) commitInterimLocally();
          return;
        }
        const commit =
          opts.force || pcm.byteLength >= VOICE_MAX_WINDOW_BYTES;
        publish(applyVoiceTranscript(current, text, commit));
        if (commit) {
          pcmChunksRef.current = [];
          pcmBytesRef.current = 0;
        }
      } catch (error) {
        fail(error);
      }
    },
    [commitInterimLocally, fail, publish, reportId]
  );

  const enqueueFlush = useCallback(
    (opts: { force: boolean }) => {
      flushChainRef.current = flushChainRef.current
        .then(() => flushWindow(opts))
        .catch((error) => {
          fail(error);
        });
      return flushChainRef.current;
    },
    [fail, flushWindow]
  );

  const stop = useCallback(async () => {
    if (statusRef.current === "idle" || statusRef.current === "stopping") {
      return;
    }
    setStatus("stopping");
    liveRef.current = false;
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    tearDownAudio();
    await enqueueFlush({ force: true });
    pcmChunksRef.current = [];
    pcmBytesRef.current = 0;
    transcriptRef.current = null;
    setStatus("idle");
  }, [enqueueFlush, tearDownAudio]);
  stopRef.current = stop;

  const start = useCallback(async () => {
    if (disabled || statusRef.current !== "idle") return;
    setStatus("requesting");
    transcriptRef.current = createVoiceTranscriptState(getPrefixRef.current());
    pcmChunksRef.current = [];
    pcmBytesRef.current = 0;
    flushChainRef.current = Promise.resolve();

    try {
      const warmup = await fetch(transcribeUrl(reportId), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!warmup.ok) {
        throw new Error(
          warmup.status === 401
            ? "Sign in to use voice input."
            : "Could not start voice input."
        );
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = mediaStream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      const blob = new Blob([PCM_CAPTURE_WORKLET], {
        type: "application/javascript",
      });
      const workletUrl = URL.createObjectURL(blob);
      try {
        await audioContext.audioWorklet.addModule(workletUrl);
      } finally {
        URL.revokeObjectURL(workletUrl);
      }

      const source = audioContext.createMediaStreamSource(mediaStream);
      sourceRef.current = source;
      const worklet = new AudioWorkletNode(audioContext, "pcm-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      workletRef.current = worklet;
      const mute = audioContext.createGain();
      mute.gain.value = 0;
      gainRef.current = mute;
      worklet.port.onmessage = (event: MessageEvent) => {
        const data = event.data as { pcm?: ArrayBuffer; rms?: number };
        if (typeof data.rms === "number") setLevel(data.rms);
        if (!data.pcm || !liveRef.current) return;
        const chunk = new Uint8Array(data.pcm);
        pcmChunksRef.current.push(chunk);
        pcmBytesRef.current += chunk.byteLength;
        if (pcmBytesRef.current >= VOICE_MAX_WINDOW_BYTES) {
          enqueueFlush({ force: true });
        }
      };
      liveRef.current = true;
      source.connect(worklet);
      worklet.connect(mute);
      mute.connect(audioContext.destination);

      setStatus("recording");
      flushTimerRef.current = setInterval(() => {
        if (liveRef.current) enqueueFlush({ force: false });
      }, VOICE_FLUSH_MS);
      maxDurationTimerRef.current = setTimeout(() => {
        void stop();
      }, VOICE_MAX_DURATION_MS);
    } catch (error) {
      liveRef.current = false;
      tearDownAudio();
      transcriptRef.current = null;
      setStatus("idle");
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        toast.error("Microphone access is required for voice input.");
        return;
      }
      toast.error(voiceUserErrorMessage(error));
    }
  }, [disabled, enqueueFlush, reportId, stop, tearDownAudio]);

  const toggle = useCallback(() => {
    if (
      statusRef.current === "recording" ||
      statusRef.current === "requesting"
    ) {
      void stop();
      return;
    }
    void start();
  }, [start, stop]);

  useEffect(() => {
    return () => {
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
      tearDownAudio();
    };
  }, [tearDownAudio]);

  const recording = status === "recording" || status === "stopping";
  const locked = status !== "idle";

  return { status, recording, locked, level, toggle };
}
