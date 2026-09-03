"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type ChatStatus,
  type FileUIPart,
  type UIMessage,
} from "ai";
import {
  readJsonBody,
  resolveChatTurnUrl,
} from "@/lib/ai/chat/chat-turn-url";
import { toast } from "sonner";
import { useChatWatchdog } from "@/hooks/use-chat-watchdog";
import {
  CHAT_ASSISTANT_ERROR_MESSAGE,
  assistantPartsHaveVisibleContent,
  assistantPartsHaveVisibleText,
  isChatClientDisconnectError,
} from "@/lib/ai/chat/assistant-turn";
import {
  CHAT_TURN_POLL_MS,
  backgroundTurnFromSessionView,
} from "@/lib/ai/chat/background-turn-status";
import {
  isChatSessionBusy,
  isChatTurnBusy,
  reportChatInstanceId,
} from "@/lib/ai/chat/session-runtime";
import type { ChatSessionView } from "@/lib/ai/chat/sessions";

export type ChatSessionSend = (
  message: {
    text?: string;
    files?: FileUIPart[];
    metadata?: Record<string, unknown>;
  },
  options?: { body?: Record<string, unknown> }
) => void | Promise<void>;

export type ChatSessionRuntime = {
  messages: UIMessage[];
  sendMessage: ChatSessionSend;
  status: ChatStatus;
  error: Error | undefined;
  stop: () => void;
  stopTurn: () => void;
  streamBusy: boolean;
  backgroundTurn: boolean;
  busy: boolean;
  elapsedMs: number;
  silentMs: number;
};

export const IDLE_CHAT_RUNTIME: ChatSessionRuntime = {
  messages: [],
  sendMessage: async () => {},
  status: "ready",
  error: undefined,
  stop: () => {},
  stopTurn: () => {},
  streamBusy: false,
  backgroundTurn: false,
  busy: false,
  elapsedMs: 0,
  silentMs: 0,
};

/**
 * One `useChat` instance per session. Hidden hosts stay mounted so a
 * background turn keeps streaming (or polling) after the user opens another
 * thread. Disconnect / watchdog give-up drop the SSE only — the server keeps
 * going until persist, then this host reloads the finished row.
 */
export function ChatSessionHost({
  reportId,
  sessionId,
  api,
  hydrateOnMount,
  onFinishTurn,
  onTurnCompleted,
  onSettled,
  onRuntime,
}: {
  reportId: string;
  sessionId: string;
  api: string;
  hydrateOnMount: boolean;
  onFinishTurn: () => void;
  onTurnCompleted: (startedAt: number | null) => void;
  onSettled: (sessionId: string) => void;
  onRuntime: (sessionId: string, runtime: ChatSessionRuntime) => void;
}) {
  const finishTurnRef = useRef(onFinishTurn);
  const onTurnCompletedRef = useRef(onTurnCompleted);
  const statusRef = useRef<ChatStatus>("ready");
  const setMessagesRef = useRef<(messages: UIMessage[]) => void>(() => {});
  const clearErrorRef = useRef<() => void>(() => {});
  const agentRunStartedAtRef = useRef<number | null>(null);
  const [backgroundTurn, setBackgroundTurn] = useState(false);

  const hydrateFromServer = useCallback(async () => {
    if (isChatTurnBusy(statusRef.current)) return;
    try {
      const res = await fetch(`${api}/sessions/${sessionId}`);
      if (!res.ok) {
        if (!isChatTurnBusy(statusRef.current)) setMessagesRef.current([]);
        setBackgroundTurn(false);
        return;
      }
      const data = (await res.json()) as ChatSessionView;
      if (isChatTurnBusy(statusRef.current)) return;
      setMessagesRef.current(data.messages ?? []);
      const next = backgroundTurnFromSessionView(data);
      if (next.startedAt != null) {
        agentRunStartedAtRef.current = next.startedAt;
      }
      setBackgroundTurn(next.backgroundTurn);
      if (next.backgroundTurn) {
        clearErrorRef.current();
        return;
      }
      const last = data.messages?.[data.messages.length - 1];
      if (
        last?.role === "assistant" &&
        assistantPartsHaveVisibleContent(last.parts)
      ) {
        clearErrorRef.current();
      }
    } catch {
      if (!isChatTurnBusy(statusRef.current)) setMessagesRef.current([]);
      setBackgroundTurn(false);
    }
  }, [api, sessionId]);

  const { messages, sendMessage, setMessages, status, error, stop, clearError } =
    useChat({
    id: reportChatInstanceId(reportId, sessionId),
    transport: new DefaultChatTransport({
      api,
      fetch: (input, init) => {
        const url = resolveChatTurnUrl(reportId, api, readJsonBody(init));
        return fetch(url, init);
      },
    }),
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      finishTurnRef.current();
      if (isAbort) {
        agentRunStartedAtRef.current = null;
        setBackgroundTurn(false);
        void hydrateFromServer();
        return;
      }
      if (isDisconnect) {
        // Tab close / navigation dropped the SSE. The SDK also sets `error`
        // (isDisconnect ⊆ isError). Clear it so the panel does not show
        // “hit an error” next to “still working in the background”.
        clearErrorRef.current();
        setBackgroundTurn(true);
        return;
      }
      if (isError) {
        // A non-network stream error may still leave the isolate running
        // (Safari “Load failed”, mid-turn parse). Hydrate: if the server
        // turn is in flight, recover as a background poll.
        void hydrateFromServer();
        return;
      }
      if (
        message.role === "assistant" &&
        !assistantPartsHaveVisibleContent(message.parts)
      ) {
        toast.error(CHAT_ASSISTANT_ERROR_MESSAGE);
        agentRunStartedAtRef.current = null;
        setBackgroundTurn(false);
        return;
      }
      if (
        message.role === "assistant" &&
        !assistantPartsHaveVisibleText(message.parts)
      ) {
        // Tool-only finish: pick up a persisted budget/interrupt notice.
        void hydrateFromServer();
      }
      const startedAt = agentRunStartedAtRef.current;
      agentRunStartedAtRef.current = null;
      setBackgroundTurn(false);
      onTurnCompletedRef.current(startedAt);
      // Pick up persisted metadata (change summary / document version).
      void hydrateFromServer();
    },
    onError: (err) => {
      console.error("chat error", err);
      if (isChatClientDisconnectError(err)) return;
      toast.error(CHAT_ASSISTANT_ERROR_MESSAGE);
    },
  });

  const streamBusy = isChatTurnBusy(status);
  const busy = isChatSessionBusy({ status, backgroundTurn });

  useEffect(() => {
    finishTurnRef.current = onFinishTurn;
  }, [onFinishTurn]);

  useEffect(() => {
    onTurnCompletedRef.current = onTurnCompleted;
  }, [onTurnCompleted]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  useEffect(() => {
    clearErrorRef.current = clearError;
  }, [clearError]);

  useEffect(() => {
    if (backgroundTurn) clearError();
  }, [backgroundTurn, clearError]);

  useEffect(() => {
    if (streamBusy && agentRunStartedAtRef.current == null) {
      agentRunStartedAtRef.current = Date.now();
    }
  }, [streamBusy]);

  const { elapsedMs, silentMs } = useChatWatchdog({
    messages,
    status,
    stop,
    holdBusy: backgroundTurn,
    onGiveUp: () => setBackgroundTurn(true),
  });

  useEffect(() => {
    if (!hydrateOnMount) return;
    let cancelled = false;
    void (async () => {
      if (isChatTurnBusy(statusRef.current)) return;
      try {
        const res = await fetch(`${api}/sessions/${sessionId}`);
        if (cancelled) return;
        if (!res.ok) {
          if (!isChatTurnBusy(statusRef.current)) setMessagesRef.current([]);
          setBackgroundTurn(false);
          return;
        }
        const data = (await res.json()) as ChatSessionView;
        if (cancelled || isChatTurnBusy(statusRef.current)) return;
        setMessagesRef.current(data.messages ?? []);
        const next = backgroundTurnFromSessionView(data);
        if (next.startedAt != null) {
          agentRunStartedAtRef.current = next.startedAt;
        }
        setBackgroundTurn(next.backgroundTurn);
      } catch {
        if (cancelled) return;
        if (!isChatTurnBusy(statusRef.current)) setMessagesRef.current([]);
        setBackgroundTurn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateOnMount, sessionId, api]);

  useEffect(() => {
    if (!backgroundTurn || streamBusy) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${api}/sessions/${sessionId}`);
        if (!res.ok || cancelled) return;
        const view = (await res.json()) as ChatSessionView;
        if (cancelled) return;
        const next = backgroundTurnFromSessionView(view);
        if (next.backgroundTurn) return;
        setMessages(view.messages ?? []);
        setBackgroundTurn(false);
        const startedAt = agentRunStartedAtRef.current;
        agentRunStartedAtRef.current = null;
        onTurnCompletedRef.current(startedAt);
        finishTurnRef.current();
      } catch {
        // Keep polling until the turn row is readable.
      }
    };
    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, CHAT_TURN_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, backgroundTurn, sessionId, setMessages, streamBusy]);

  const stopTurn = useCallback(() => {
    void fetch(`${api}/sessions/${sessionId}/cancel`, { method: "POST" });
    agentRunStartedAtRef.current = null;
    setBackgroundTurn(false);
    stop();
  }, [api, sessionId, stop]);

  useEffect(() => {
    if (!busy) {
      onSettled(sessionId);
    }
  }, [busy, onSettled, sessionId]);

  useEffect(() => {
    onRuntime(sessionId, {
      messages: messages as UIMessage[],
      sendMessage: sendMessage as ChatSessionSend,
      status,
      error,
      stop,
      stopTurn,
      streamBusy,
      backgroundTurn,
      busy,
      elapsedMs,
      silentMs,
    });
  }, [
    backgroundTurn,
    busy,
    elapsedMs,
    error,
    messages,
    onRuntime,
    sendMessage,
    sessionId,
    silentMs,
    status,
    stop,
    stopTurn,
    streamBusy,
  ]);

  return null;
}
