"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { VOICE_MAX_DURATION_MS } from "@/lib/voice/constants";
import { parseVoiceSseData, type VoiceSseEvent } from "@/lib/voice/events";
import { PCM_CAPTURE_WORKLET } from "@/lib/voice/pcm-worklet";
import {
  applyVoiceTranscript,
  createVoiceTranscriptState,
  voiceComposerValue,
  type VoiceTranscriptState,
} from "@/lib/voice/transcript";

type VoiceStatus = "idle" | "requesting" | "recording" | "stopping";

export function useVoiceDictation(opts: {
  reportId: string;
  getPrefix: () => string;
  onComposerValue: (value: string) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [level, setLevel] = useState(0);
  const statusRef = useRef(status);
  statusRef.current = status;
  const getPrefixRef = useRef(opts.getPrefix);
  getPrefixRef.current = opts.getPrefix;
  const onComposerValueRef = useRef(opts.onComposerValue);
  onComposerValueRef.current = opts.onComposerValue;
  const reportIdRef = useRef(opts.reportId);
  reportIdRef.current = opts.reportId;
  const disabledRef = useRef(opts.disabled);
  disabledRef.current = opts.disabled;

  const transcriptRef = useRef<VoiceTranscriptState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(
    null
  );
  const mediaRef = useRef<{
    stream: MediaStream;
    context: AudioContext;
    workletUrl: string;
  } | null>(null);
  const maxTimerRef = useRef<number | null>(null);

  const recording = status === "recording" || status === "stopping";

  const cleanupCapture = useCallback(() => {
    if (maxTimerRef.current != null) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    const media = mediaRef.current;
    mediaRef.current = null;
    if (media) {
      for (const track of media.stream.getTracks()) track.stop();
      void media.context.close();
      URL.revokeObjectURL(media.workletUrl);
    }
    setLevel(0);
  }, []);

  const applyEvent = useCallback((event: VoiceSseEvent) => {
    if (event.type !== "transcript") return;
    const current =
      transcriptRef.current ??
      createVoiceTranscriptState(getPrefixRef.current());
    const next = applyVoiceTranscript(current, event.text, event.isFinal);
    transcriptRef.current = next;
    onComposerValueRef.current(voiceComposerValue(next));
  }, []);

  const stop = useCallback(async () => {
    if (statusRef.current === "idle") return;
    setStatus("stopping");
    cleanupCapture();
    try {
      await writerRef.current?.close();
    } catch {
      // Already closed when the server finished.
    }
    writerRef.current = null;
  }, [cleanupCapture]);

  const start = useCallback(async () => {
    if (disabledRef.current || statusRef.current !== "idle") return;
    setStatus("requesting");
    transcriptRef.current = createVoiceTranscriptState(getPrefixRef.current());

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      setStatus("idle");
      transcriptRef.current = null;
      toast.error("Microphone permission is required for voice input.");
      return;
    }

    const context = new AudioContext();
    const workletUrl = URL.createObjectURL(
      new Blob([PCM_CAPTURE_WORKLET], { type: "application/javascript" })
    );
    try {
      await context.audioWorklet.addModule(workletUrl);
    } catch {
      for (const track of stream.getTracks()) track.stop();
      URL.revokeObjectURL(workletUrl);
      setStatus("idle");
      transcriptRef.current = null;
      toast.error("This browser cannot stream microphone audio.");
      return;
    }

    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();
    writerRef.current = writer;
    const abort = new AbortController();
    abortRef.current = abort;
    mediaRef.current = { stream, context, workletUrl };

    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "pcm-capture");
    const silence = context.createGain();
    silence.gain.value = 0;
    node.port.onmessage = (
      message: MessageEvent<{ rms: number; pcm: ArrayBuffer }>
    ) => {
      const { rms, pcm } = message.data;
      setLevel(Math.min(1, rms * 4));
      void writer.write(new Uint8Array(pcm)).catch(() => {
        // Writer closed on stop.
      });
    };
    source.connect(node);
    node.connect(silence);
    silence.connect(context.destination);
    await context.resume();

    maxTimerRef.current = window.setTimeout(() => {
      toast.message("Voice input stopped after four minutes.");
      void stop();
    }, VOICE_MAX_DURATION_MS);

    setStatus("recording");

    try {
      const response = await fetch(
        `/api/reports/${reportIdRef.current}/chat/transcribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: readable,
          signal: abort.signal,
          duplex: "half",
        } as RequestInit & { duplex: "half" }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          payload?.error ?? `Voice input failed (${response.status})`
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Voice input returned no stream.");
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const dataLine = frame
            .split("\n")
            .find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          const event = parseVoiceSseData(dataLine.slice(5));
          if (!event) continue;
          if (event.type === "error") {
            toast.error(event.message);
          } else if (event.type === "transcript") {
            applyEvent(event);
          }
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        toast.error(
          error instanceof Error ? error.message : "Voice input failed."
        );
      }
    } finally {
      cleanupCapture();
      writerRef.current = null;
      abortRef.current = null;
      transcriptRef.current = null;
      setStatus("idle");
    }
  }, [applyEvent, cleanupCapture, stop]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cleanupCapture();
    };
  }, [cleanupCapture]);

  const toggle = useCallback(() => {
    if (statusRef.current === "idle") {
      void start();
      return;
    }
    void stop();
  }, [start, stop]);

  return {
    status,
    recording,
    level,
    start,
    stop,
    toggle,
  };
}
