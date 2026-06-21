import type { WorkspaceUser } from "@/lib/auth/workspace-user";

export type AuditActorSnapshot = {
  id: string;
  name: string;
  role: string;
};

export const SYSTEM_ACTOR: AuditActorSnapshot = {
  id: "system",
  name: "System",
  role: "system",
};

export const AI_ACTOR: AuditActorSnapshot = {
  id: "ai",
  name: "AI",
  role: "system",
};

export const WORD_ACTOR: AuditActorSnapshot = {
  id: "word",
  name: "Word Import",
  role: "system",
};

export function auditActorFromUser(user: WorkspaceUser): AuditActorSnapshot {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
  };
}

export function auditActorFromId(
  authorId: string,
  name?: string
): AuditActorSnapshot {
  if (authorId === "ai") return AI_ACTOR;
  if (authorId === "word") return WORD_ACTOR;
  if (authorId === "system") return SYSTEM_ACTOR;
  return {
    id: authorId,
    name: name ?? authorId,
    role: "unknown",
  };
}
