import { isFileUIPart, type FileUIPart, type UIMessage } from "ai";

export function buildPendingChatUserMessage(input: {
  text: string;
  files?: FileUIPart[];
  metadata?: Record<string, unknown>;
  id?: string;
}): UIMessage {
  const parts: UIMessage["parts"] = [];
  const text = input.text.trim();
  if (text) {
    parts.push({ type: "text", text });
  }
  for (const file of input.files ?? []) {
    parts.push(file);
  }
  return {
    id: input.id ?? `pending-${crypto.randomUUID()}`,
    role: "user",
    parts,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function userMessageText(message: UIMessage): string {
  return (message.parts ?? [])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function userMessageFileUrls(message: UIMessage): string[] {
  return (message.parts ?? [])
    .filter(
      (part): part is FileUIPart =>
        isFileUIPart(part) && part.mediaType.startsWith("image/")
    )
    .map((part) => part.url);
}

/** True when `useChat` has already appended the same user turn. */
export function pendingChatUserMessageIsRepresented(
  messages: readonly UIMessage[],
  pending: UIMessage
): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return false;
  if (last.id === pending.id) return true;
  if (userMessageText(last) !== userMessageText(pending)) return false;
  const pendingUrls = userMessageFileUrls(pending);
  const lastUrls = userMessageFileUrls(last);
  if (pendingUrls.length !== lastUrls.length) return false;
  return pendingUrls.every((url, index) => lastUrls[index] === url);
}

export function mergePendingChatUserMessage(
  messages: readonly UIMessage[],
  pending: UIMessage | null
): UIMessage[] {
  if (!pending) return [...messages];
  if (pendingChatUserMessageIsRepresented(messages, pending)) {
    return [...messages];
  }
  return [...messages, pending];
}
