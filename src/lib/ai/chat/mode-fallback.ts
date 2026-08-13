import type { UserRole } from "@/lib/auth/roles";
import type { ChatMode } from "@/lib/ai/chat/system-prompt";

/**
 * Agent is the default. Fall back to Plan only once we know the user cannot
 * propose edits. An unknown role must not flip the mode — the user directory
 * can still be hydrating, and a premature Plan lock never switches back.
 */
export function chatModeAfterPermissionCheck({
  mode,
  role,
  canProposeAiEdits,
}: {
  mode: ChatMode;
  role: UserRole | undefined;
  canProposeAiEdits: boolean;
}): ChatMode {
  if (role == null) return mode;
  if (!canProposeAiEdits && mode === "agent") return "plan";
  return mode;
}
