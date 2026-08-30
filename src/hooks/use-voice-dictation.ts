"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { VOICE_MAX_DURATION_MS, VOICE_SAMPLE_RATE_HZ } from "@/lib/voice/constants";
import { parseVoiceSseBlock } from "@/lib/voice/events";
import { PCM_CAPTURE_WORKLET } from "@/lib/voice/pcm-worklet";
import {
  applyVoiceTranscript,
  createVoiceTranscriptState,
  voiceComposerValue,
  type VoiceTranscriptState,
} from "@/lib/voice/transcript";

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

function transcribeUrl(reportId: string, sessionId?: string): string {
  const path = `/api/reports/${reportId}/chat/transcribe`;
  if (!sessionId) return path;
  return `${path}?session=${encodeURIComponent(sessionId)}`;
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
  const sessionIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  const sseDoneRef = useRef<Promise<void>>(Promise.resolve());
  const audioQueueRef = useRef<Promise<void>>(Promise.resolve());
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tearDownAudio = useCallback(() => {
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

  const applyEvent = useCallback((raw: string) => {
    const event = parseVoiceSseBlock(raw);
    if (!event) return;
    if (event.type === "error") {
      toast.error(event.message);
      return;
    }
    if (event.type === "transcript") {
      const current = transcriptRef.current;
      if (!current) return;
      transcriptRef.current = applyVoiceTranscript(
        current,
        event.text,
        event.isFinal
      );
      onComposerValueRef.current(voiceComposerValue(transcriptRef.current));
    }
  }, []);

  const listenSse = useCallback(
    async (sessionId: string, signal: AbortSignal) => {
      const response = await fetch(transcribeUrl(reportId, sessionId), {
        method: "GET",
        credentials: "include",
        signal,
        cache: "no-store",
      });
      if (!response.ok || !response.body) {
        throw new Error(
          response.status === 404
            ? "Voice session expired. Try again."
            : "Could not start voice input."
        );
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          applyEvent(part);
        }
      }
      if (buffer.trim()) applyEvent(buffer);
    },
    [applyEvent, reportId]
  );

  const enqueueAudio = useCallback(
    (pcm: ArrayBuffer) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      audioQueueRef.current = audioQueueRef.current
        .then(async () => {
          if (!sessionIdRef.current) return;
          await fetch(transcribeUrl(reportId), {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/octet-stream",
              "x-voice-session": sessionId,
            },
            body: pcm,
          });
        })
        .catch(() => {
          /* a dropped chunk is better than stalling the mic */
        });
    },
    [reportId]
  );

  const stop = useCallback(async () => {
    if (statusRef.current === "idle" || statusRef.current === "stopping") return;
    setStatus("stopping");
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    tearDownAudio();
    const sessionId = sessionIdRef.current;
    try {
      await audioQueueRef.current;
    } catch {
      /* ignore */
    }
    if (sessionId) {
      try {
        await fetch(transcribeUrl(reportId), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop", sessionId }),
        });
      } catch {
        /* SSE done still ends the turn */
      }
    }
    try {
      await Promise.race([
        sseDoneRef.current,
        new Promise((resolve) => setTimeout(resolve, 8_000)),
      ]);
    } catch {
      /* listenSse already toasted */
    }
    sseAbortRef.current?.abort();
    sseAbortRef.current = null;
    sessionIdRef.current = null;
    transcriptRef.current = null;
    setStatus("idle");
  }, [reportId, tearDownAudio]);

  const start = useCallback(async () => {
    if (disabled || statusRef.current !== "idle") return;
    setStatus("requesting");
    transcriptRef.current = createVoiceTranscriptState(getPrefixRef.current());

    try {
      const startResponse = await fetch(transcribeUrl(reportId), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (!startResponse.ok) {
        throw new Error("Could not start voice input.");
      }
      const { sessionId } = (await startResponse.json()) as { sessionId?: string };
      if (!sessionId) {
        throw new Error("Could not start voice input.");
      }
      sessionIdRef.current = sessionId;

      const sseAbort = new AbortController();
      sseAbortRef.current = sseAbort;
      const ssePromise = listenSse(sessionId, sseAbort.signal);
      sseDoneRef.current = ssePromise.catch((error) => {
        if (sseAbort.signal.aborted) return;
        throw error;
      });

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
        if (data.pcm) enqueueAudio(data.pcm);
      };
      source.connect(worklet);
      worklet.connect(mute);
      mute.connect(audioContext.destination);

      setStatus("recording");
      maxDurationTimerRef.current = setTimeout(() => {
        void stop();
      }, VOICE_MAX_DURATION_MS);

      void ssePromise.catch((error) => {
        if (sseAbort.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Voice input failed.";
        toast.error(message);
        void stop();
      });
    } catch (error) {
      tearDownAudio();
      sseAbortRef.current?.abort();
      sseAbortRef.current = null;
      sessionIdRef.current = null;
      transcriptRef.current = null;
      setStatus("idle");
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        toast.error("Microphone access is required for voice input.");
        return;
      }
      const message =
        error instanceof Error ? error.message : "Could not start the microphone.";
      toast.error(message);
    }
  }, [disabled, enqueueAudio, listenSse, reportId, stop, tearDownAudio]);

  const toggle = useCallback(() => {
    if (statusRef.current === "recording" || statusRef.current === "requesting") {
      void stop();
      return;
    }
    void start();
  }, [start, stop]);

  useEffect(() => {
    return () => {
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
      sseAbortRef.current?.abort();
      tearDownAudio();
    };
  }, [tearDownAudio]);

  const recording = status === "recording" || status === "stopping";

  return { status, recording, level, toggle };
}
