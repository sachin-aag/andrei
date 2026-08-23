"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatStatus } from "ai";
import {
  assistantProgressSignature,
  chatWatchdogPhase,
} from "@/lib/ai/chat/assistant-turn";
import { isChatTurnBusy } from "@/lib/ai/chat/session-runtime";

type WatchdogMessage = {
  role?: string;
  parts?: Parameters<typeof assistantProgressSignature>[0];
};

export function useChatWatchdog({
  messages,
  status,
  stop,
  onGiveUp,
  enabled = true,
  holdBusy = false,
}: {
  messages: readonly WatchdogMessage[];
  status: ChatStatus;
  stop: () => void;
  onGiveUp?: () => void;
  enabled?: boolean;
  /** Keep the elapsed clock running after the SSE is dropped (server still working). */
  holdBusy?: boolean;
}): { elapsedMs: number; silentMs: number } {
  const streamBusy = enabled && isChatTurnBusy(status);
  const busy = streamBusy || holdBusy;
  const [elapsedMs, setElapsedMs] = useState(0);
  const [silentMs, setSilentMs] = useState(0);
  const busyStartedAtRef = useRef<number | null>(null);
  const lastProgressAtRef = useRef<number | null>(null);
  const lastProgressSigRef = useRef("");
  const stoppedForWatchdogRef = useRef(false);
  const messagesRef = useRef(messages);
  const stopRef = useRef(stop);
  const onGiveUpRef = useRef(onGiveUp);
  const streamBusyRef = useRef(streamBusy);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    stopRef.current = stop;
    onGiveUpRef.current = onGiveUp;
    streamBusyRef.current = streamBusy;
  }, [onGiveUp, stop, streamBusy]);

  useEffect(() => {
    if (!busy) {
      busyStartedAtRef.current = null;
      lastProgressAtRef.current = null;
      lastProgressSigRef.current = "";
      stoppedForWatchdogRef.current = false;
      return;
    }
    if (busyStartedAtRef.current == null) busyStartedAtRef.current = Date.now();
    const tick = () => {
      const now = Date.now();
      const started = busyStartedAtRef.current ?? now;
      let lastAssistant: WatchdogMessage | undefined;
      for (let i = messagesRef.current.length - 1; i >= 0; i--) {
        const message = messagesRef.current[i];
        if (message?.role === "assistant") {
          lastAssistant = message;
          break;
        }
      }
      const signature = assistantProgressSignature(lastAssistant?.parts);
      if (signature !== lastProgressSigRef.current) {
        lastProgressSigRef.current = signature;
        lastProgressAtRef.current = now;
      }
      const progress = lastProgressAtRef.current ?? started;
      setElapsedMs(now - started);
      setSilentMs(now - progress);
      if (
        streamBusyRef.current &&
        chatWatchdogPhase({
          busy: true,
          elapsedMs: now - started,
          silentMs: now - progress,
        }) === "give_up" &&
        !stoppedForWatchdogRef.current
      ) {
        // Drop a hung SSE without cancelling the server turn.
        stoppedForWatchdogRef.current = true;
        stopRef.current();
        onGiveUpRef.current?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  return { elapsedMs, silentMs };
}
