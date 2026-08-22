"use client";

import { useCallback, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type ChatStatus,
  type FileUIPart,
  type UIMessage,
} from "ai";
import { toast } from "sonner";
import { useChatWatchdog } from "@/hooks/use-chat-watchdog";
import {
  CHAT_ASSISTANT_ERROR_MESSAGE,
  CHAT_ASSISTANT_INTERRUPTED_MESSAGE,
  assistantPartsHaveVisibleContent,
} from "@/lib/ai/chat/assistant-turn";
import {
  canReplaceChatMessages,
  isChatTurnBusy,
  reportChatInstanceId,
} from "@/lib/ai/chat/session-runtime";

export type ChatSessionSend = (
  message: { text?: string; files?: FileUIPart[] },
  options?: { body?: Record<string, unknown> }
) => void | Promise<void>;

export type ChatSessionRuntime = {
  messages: UIMessage[];
  sendMessage: ChatSessionSend;
  status: ChatStatus;
  error: Error | undefined;
  stop: () => void;
};

export const IDLE_CHAT_RUNTIME: ChatSessionRuntime = {
  messages: [],
  sendMessage: async () => {},
  status: "ready",
  error: undefined,
  stop: () => {},
};

/**
 * One `useChat` instance per session. Hidden hosts stay mounted so a
 * background turn keeps streaming after the user opens another thread.
 */
export function ChatSessionHost({
  reportId,
  sessionId,
  api,
  hydrateOnMount,
  active,
  onFinishTurn,
  onSettled,
  onRuntime,
}: {
  reportId: string;
  sessionId: string;
  api: string;
  hydrateOnMount: boolean;
  active: boolean;
  onFinishTurn: () => void;
  onSettled: (sessionId: string) => void;
  onRuntime: (sessionId: string, runtime: ChatSessionRuntime) => void;
}) {
  const finishTurnRef = useRef(onFinishTurn);
  const statusRef = useRef<ChatStatus>("ready");
  const setMessagesRef = useRef<(messages: UIMessage[]) => void>(() => {});

  const hydrateFromServer = useCallback(async () => {
    if (!canReplaceChatMessages(statusRef.current)) return;
    try {
      const res = await fetch(`${api}/sessions/${sessionId}`);
      if (!res.ok) {
        if (canReplaceChatMessages(statusRef.current)) setMessagesRef.current([]);
        return;
      }
      const data = (await res.json()) as { messages: UIMessage[] };
      if (!canReplaceChatMessages(statusRef.current)) return;
      setMessagesRef.current(data.messages ?? []);
    } catch {
      if (canReplaceChatMessages(statusRef.current)) setMessagesRef.current([]);
    }
  }, [api, sessionId]);

  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    id: reportChatInstanceId(reportId, sessionId),
    transport: new DefaultChatTransport({ api }),
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      finishTurnRef.current();
      if (isAbort || isDisconnect) {
        void hydrateFromServer();
        return;
      }
      if (isError) return;
      if (
        message.role === "assistant" &&
        !assistantPartsHaveVisibleContent(message.parts)
      ) {
        toast.error(CHAT_ASSISTANT_ERROR_MESSAGE);
      }
    },
    onError: (err) => {
      console.error("chat error", err);
      toast.error(CHAT_ASSISTANT_ERROR_MESSAGE);
    },
  });

  useEffect(() => {
    finishTurnRef.current = onFinishTurn;
  }, [onFinishTurn]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  useChatWatchdog({
    messages,
    status,
    stop,
    enabled: !active,
    onGiveUp: () => toast.error(CHAT_ASSISTANT_INTERRUPTED_MESSAGE),
  });

  useEffect(() => {
    if (!hydrateOnMount) return;
    void hydrateFromServer();
    // First mount only — a later switch back must not wipe an in-flight turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrateOnMount, sessionId]);

  useEffect(() => {
    if (!isChatTurnBusy(status)) {
      onSettled(sessionId);
    }
  }, [onSettled, sessionId, status]);

  useEffect(() => {
    if (!active) return;
    onRuntime(sessionId, {
      messages: messages as UIMessage[],
      sendMessage: sendMessage as ChatSessionSend,
      status,
      error,
      stop,
    });
  }, [active, error, messages, onRuntime, sendMessage, sessionId, status, stop]);

  return null;
}
