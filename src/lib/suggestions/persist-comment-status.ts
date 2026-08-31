export class CommentPersistError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CommentPersistError";
    this.status = status;
  }
}

function messageForStatus(status: number, serverMessage?: string): string {
  if (serverMessage) return serverMessage;
  if (status === 403) {
    return "You don't have permission to update suggestions on this report.";
  }
  if (status === 404) {
    return "This suggestion no longer exists.";
  }
  return "Could not update suggestion. Please try again.";
}

export type SuggestionOperationAudit = {
  opIndex: number;
  coverage: number;
  classification: "edit" | "rewrite";
};

export type PatchCommentStatusExtra =
  | string
  | {
      content?: string;
      operations?: readonly SuggestionOperationAudit[];
    };

function extraContent(extra?: PatchCommentStatusExtra): string | undefined {
  if (typeof extra === "string") return extra;
  return extra?.content;
}

function extraOperations(
  extra?: PatchCommentStatusExtra,
): readonly SuggestionOperationAudit[] | undefined {
  if (!extra || typeof extra === "string") return undefined;
  return extra.operations;
}

export async function patchCommentStatus(
  reportId: string,
  commentId: string,
  status: "open" | "resolved" | "dismissed",
  extra?: PatchCommentStatusExtra,
): Promise<void> {
  const content = extraContent(extra);
  const operations = extraOperations(extra);
  let res: Response;
  try {
    res = await fetch(`/api/reports/${reportId}/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        ...(content != null ? { content } : {}),
        ...(operations ? { operations } : {}),
      }),
    });
  } catch {
    throw new CommentPersistError(0, "Could not update suggestion. Please try again.");
  }

  if (res.ok) return;

  const body = await res.json().catch(() => ({}));
  const serverMessage =
    typeof body.error === "string" ? body.error : undefined;
  throw new CommentPersistError(
    res.status,
    messageForStatus(res.status, serverMessage)
  );
}

/**
 * Flip many comment statuses in parallel. Used by bulk apply/dismiss after the
 * section content is already persisted.
 */
export async function patchCommentStatuses(
  reportId: string,
  commentIds: readonly string[],
  status: "open" | "resolved" | "dismissed",
  contentById?: Record<string, string>
): Promise<{ failedIds: string[] }> {
  const results = await Promise.all(
    commentIds.map(async (id) => {
      try {
        await patchCommentStatus(reportId, id, status, contentById?.[id]);
        return { id, ok: true as const };
      } catch {
        return { id, ok: false as const };
      }
    })
  );
  return { failedIds: results.filter((r) => !r.ok).map((r) => r.id) };
}
