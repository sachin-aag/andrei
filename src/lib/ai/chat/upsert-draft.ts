import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments } from "@/db/schema";
import type { SectionType } from "@/db/schema";
import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import { serializeAiRedraftCommentContent } from "@/lib/ai/suggestion-gating";

const CHAT_DRAFT_KINDS = ["ai_fix", "ai_redraft"] as const;

export type OpenChatFieldSuggestion = {
  id: string;
  kind: "ai_fix" | "ai_redraft";
  createdAt: Date;
};

export type ChatFieldDraftPlan =
  | {
      mode: "insert";
      suggestionId: string;
      replaced: false;
      dismissIds: string[];
    }
  | {
      mode: "update";
      suggestionId: string;
      replaced: true;
      dismissIds: string[];
    };

export type ChatFieldDraftStore = {
  listOpen: () => Promise<OpenChatFieldSuggestion[]>;
  insertRedraft: (args: { id: string; content: string }) => Promise<void>;
  updateRedraft: (args: { id: string; content: string }) => Promise<void>;
  dismiss: (ids: string[]) => Promise<void>;
};

export type UpsertChatFieldDraftInput = {
  markdown: string;
  reasoning: string;
  fieldHashAtSuggestion: string;
};

export type UpsertChatFieldDraftResult = {
  suggestionId: string;
  replaced: boolean;
};

export type PersistChatFieldDraftInput = UpsertChatFieldDraftInput & {
  reportId: string;
  sectionId: string;
  section: SectionType;
  targetField: string;
};

function compareOpenSuggestions(
  a: OpenChatFieldSuggestion,
  b: OpenChatFieldSuggestion
): number {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id.localeCompare(b.id);
}

/**
 * Decide whether to insert a new chat `ai_redraft` or update the oldest open
 * one on this field. Sibling chat `ai_fix`s (and extra redrafts) are dismissed
 * so the engineer sees a single card.
 */
export function planChatFieldDraftUpsert(
  open: readonly OpenChatFieldSuggestion[],
  nextId: () => string = createId
): ChatFieldDraftPlan {
  const redrafts = open
    .filter((row) => row.kind === "ai_redraft")
    .toSorted(compareOpenSuggestions);
  const dismissFixes = open
    .filter((row) => row.kind === "ai_fix")
    .map((row) => row.id);

  if (redrafts.length > 0) {
    const keep = redrafts[0]!;
    return {
      mode: "update",
      suggestionId: keep.id,
      replaced: true,
      dismissIds: [
        ...redrafts.slice(1).map((row) => row.id),
        ...dismissFixes,
      ],
    };
  }

  return {
    mode: "insert",
    suggestionId: nextId(),
    replaced: false,
    dismissIds: dismissFixes,
  };
}

export async function upsertChatFieldDraft(
  store: ChatFieldDraftStore,
  input: UpsertChatFieldDraftInput,
  nextId: () => string = createId
): Promise<UpsertChatFieldDraftResult> {
  const plan = planChatFieldDraftUpsert(await store.listOpen(), nextId);
  const content = serializeAiRedraftCommentContent({
    markdown: input.markdown,
    reasoning: input.reasoning,
    fieldHashAtSuggestion: input.fieldHashAtSuggestion,
  });

  if (plan.dismissIds.length > 0) {
    await store.dismiss(plan.dismissIds);
  }

  switch (plan.mode) {
    case "update":
      await store.updateRedraft({ id: plan.suggestionId, content });
      break;
    case "insert":
      await store.insertRedraft({ id: plan.suggestionId, content });
      break;
    default: {
      const _exhaustive: never = plan;
      throw new Error(`Unhandled draft upsert mode: ${_exhaustive}`);
    }
  }

  const remaining = await store.listOpen();
  const leftoverIds = remaining
    .filter((row) => row.id !== plan.suggestionId)
    .map((row) => row.id);
  if (leftoverIds.length > 0) {
    await store.dismiss(leftoverIds);
  }

  return { suggestionId: plan.suggestionId, replaced: plan.replaced };
}

/**
 * Persist a chat field draft, replacing any open chat-authored redraft on the
 * same field. Criteria Suggest-fixes (`evaluationId` set) are not touched.
 */
export async function persistChatFieldDraft(
  input: PersistChatFieldDraftInput
): Promise<UpsertChatFieldDraftResult> {
  return db.transaction(async (tx) => {
    const lockKey = `chat-draft:${input.reportId}:${input.section}:${input.targetField}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const store: ChatFieldDraftStore = {
      async listOpen() {
        const rows = await tx
          .select({
            id: comments.id,
            kind: comments.kind,
            createdAt: comments.createdAt,
          })
          .from(comments)
          .where(
            and(
              eq(comments.reportId, input.reportId),
              eq(comments.section, input.section),
              eq(comments.contentPath, input.targetField),
              eq(comments.status, "open"),
              eq(comments.authorId, AI_AUTHOR_ID),
              isNull(comments.parentId),
              isNull(comments.evaluationId),
              inArray(comments.kind, [...CHAT_DRAFT_KINDS])
            )
          );

        return rows.flatMap((row) => {
          if (row.kind !== "ai_fix" && row.kind !== "ai_redraft") return [];
          return [
            {
              id: row.id,
              kind: row.kind,
              createdAt: row.createdAt,
            },
          ];
        });
      },
      async insertRedraft({ id, content }) {
        await tx.insert(comments).values({
          id,
          reportId: input.reportId,
          sectionId: input.sectionId,
          section: input.section,
          authorId: AI_AUTHOR_ID,
          content,
          anchorText: "",
          contentPath: input.targetField,
          fromPos: null,
          toPos: null,
          status: "open",
          kind: "ai_redraft",
          evaluationId: null,
        });
      },
      async updateRedraft({ id, content }) {
        await tx
          .update(comments)
          .set({ content, anchorText: "" })
          .where(eq(comments.id, id));
      },
      async dismiss(ids) {
        if (ids.length === 0) return;
        await tx
          .update(comments)
          .set({ status: "dismissed" })
          .where(inArray(comments.id, ids));
      },
    };

    return upsertChatFieldDraft(store, {
      markdown: input.markdown,
      reasoning: input.reasoning,
      fieldHashAtSuggestion: input.fieldHashAtSuggestion,
    });
  });
}
