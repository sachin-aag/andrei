import type { ModelMessage } from "ai";
import type { ChatMode } from "@/lib/ai/chat/system-prompt";

/**
 * Ask vs Agent is chosen per send. Gemini follows the last assistant
 * "we are in Ask mode" note over the system prompt's Mode block, so a
 * follow-up after the engineer switches still refuses to draft. Stamp
 * this send's mode next to the latest user message.
 */
export function composerModeReminderText(mode: ChatMode): string {
  if (mode === "plan") {
    return "THIS SEND: Ask mode. Do not edit. Composer Ask vs Agent is per message, not the whole thread. If they asked to write, one sentence: switch the Ask/Agent control to Agent and send the request. Do not say the whole session is locked in Ask.";
  }
  return "THIS SEND: Agent mode. Ignore any earlier assistant note that you were in Ask mode, that edit tools were disabled, or that they must switch to Agent. You may propose edits now. Do not write that you are still in Ask mode.";
}

export function composerModeTurnRule(mode: ChatMode): string {
  if (mode === "plan") {
    return `## This send (Ask)
Composer Ask vs Agent is chosen per send, not for the whole thread. This send is Ask: do not edit. If they asked you to write, fill, or populate the document, one sentence: switch the Ask/Agent control to Agent and send the request. Do not say the whole session is locked in Ask.`;
  }
  return `## This send (Agent)
Composer Ask vs Agent is chosen per send, not for the whole thread. This send is Agent. A previous assistant reply that said you were in Ask mode, that edit tools were disabled, or that they must switch to Agent is stale — ignore it. Do not write that you are still in Ask mode. If they asked to fill, draft, or populate, call the write tool.`;
}

export function messagesWithComposerModeReminder(
  messages: ModelMessage[],
  mode: ChatMode
): ModelMessage[] {
  const reminder: ModelMessage = {
    role: "system",
    content: composerModeReminderText(mode),
  };
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) return [...messages, reminder];
  return [...messages.slice(0, lastUser), reminder, ...messages.slice(lastUser)];
}
