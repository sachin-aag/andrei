import type { ChatStatus } from "ai";
import { isChatTurnBusy } from "@/lib/ai/chat/session-runtime";
import {
  deriveSessionTitle,
  UNTITLED_SESSION,
} from "@/lib/ai/chat/session-title";

export type ChatSessionTabStatus = "running" | "questions" | "done";

export type ChatSessionTabMessage = {
  role?: string;
  parts?: readonly ChatSessionTabPart[] | null;
};

export type ChatSessionTabPart = {
  type?: string;
  text?: unknown;
  input?: unknown;
  state?: string;
};

export type SessionTabSnapshot = {
  status: ChatSessionTabStatus;
  title: string;
};

export type ChatSessionTabItem = {
  id: string;
  title: string;
  status: ChatSessionTabStatus;
};

export function chatSessionTabStatusLabel(
  status: ChatSessionTabStatus
): string {
  switch (status) {
    case "running":
      return "Still working";
    case "questions":
      return "Needs answers";
    case "done":
      return "Ready";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function firstUserMessageTitle(
  messages: readonly ChatSessionTabMessage[]
): string {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = (message.parts ?? [])
      .filter(
        (part) => part?.type === "text" && typeof part.text === "string"
      )
      .map((part) => (part.text as string).trim())
      .find((part) => part.length > 0);
    if (text) return deriveSessionTitle(text);
  }
  return UNTITLED_SESSION;
}

export function chatHasOpenQuestions(
  messages: readonly ChatSessionTabMessage[]
): boolean {
  if (messages.length === 0) return false;
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant") return false;
  for (const part of last.parts ?? []) {
    if (part?.type !== "tool-ask_user") continue;
    if (part.state === "output-error") continue;
    if (!askUserPartHasQuestions(part.input)) continue;
    return true;
  }
  return false;
}

export function chatSessionTabStatus(
  status: ChatStatus,
  messages: readonly ChatSessionTabMessage[]
): ChatSessionTabStatus {
  if (isChatTurnBusy(status)) return "running";
  if (chatHasOpenQuestions(messages)) return "questions";
  return "done";
}

export function chatSessionTabSnapshot(
  status: ChatStatus,
  messages: readonly ChatSessionTabMessage[]
): SessionTabSnapshot {
  return {
    status: chatSessionTabStatus(status, messages),
    title: firstUserMessageTitle(messages),
  };
}

export function sessionTabSnapshotsEqual(
  current: SessionTabSnapshot | undefined,
  next: SessionTabSnapshot
): boolean {
  return current?.status === next.status && current.title === next.title;
}

export function buildChatSessionTabItems(options: {
  mountedIds: readonly string[];
  sessions: readonly { id: string; title: string }[];
  snapshots: Readonly<Record<string, SessionTabSnapshot>>;
  runningIds: ReadonlySet<string>;
}): ChatSessionTabItem[] {
  const titleById = new Map(
    options.sessions.map((session) => [session.id, session.title])
  );
  return options.mountedIds.map((id) => {
    const listed = titleById.get(id);
    const snap = options.snapshots[id];
    const title =
      listed && listed !== UNTITLED_SESSION
        ? listed
        : (snap?.title ?? UNTITLED_SESSION);
    const status =
      snap?.status ?? (options.runningIds.has(id) ? "running" : "done");
    return { id, title, status };
  });
}

function askUserPartHasQuestions(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  const questions = (input as { questions?: unknown }).questions;
  return Array.isArray(questions) && questions.length > 0;
}
