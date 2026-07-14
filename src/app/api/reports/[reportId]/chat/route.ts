import { NextResponse, after } from "next/server";
import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type ToolSet,
  type UIMessage,
} from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  reportSections,
  criteriaEvaluations,
  comments,
  chatMessages,
} from "@/db/schema";
import type { SectionType } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { mergeSection } from "@/lib/sections-merge";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import { buildReportContextMap } from "@/lib/ai/chat/context-map";
import {
  buildChatSystemPrompt,
  isChatMode,
  type ChatMode,
} from "@/lib/ai/chat/system-prompt";
import { buildCriteriaOutline } from "@/lib/ai/chat/criteria-outline";
import { buildChatTools } from "@/lib/ai/chat/tools";
import { resolveChatLanguageModel } from "@/lib/ai/chat/model";
import { buildStubChatModel } from "@/lib/ai/chat/stub-model";
import {
  isChatEditableSection,
  parseChatSectionScope,
  primaryFieldForSection,
  type ChatSectionScope,
} from "@/lib/ai/chat/fields";
import {
  detectSectionIntentFromText,
  detectSectionScopeMismatch,
} from "@/lib/ai/chat/section-intent";
import {
  createChatSession,
  findChatSession,
  touchChatSession,
} from "@/lib/ai/chat/sessions";
import { isTestStubChat } from "@/lib/test/ai-bypass";
import {
  flushLangfuseTraces,
  langfuseGenerateTextTelemetry,
} from "@/lib/observability/langfuse";

export const maxDuration = 120;

function lastUserMessage(messages: UIMessage[]): UIMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messages[i]!;
  }
  return null;
}

function messageText(message: UIMessage | null): string {
  if (!message) return "";
  return (message.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
}

/** Naive keyword routing for the test stub (no LLM). */
function pickStubSection(text: string): SectionType {
  return detectSectionIntentFromText(text) ?? "define";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reportId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    messages?: UIMessage[];
    sessionId?: string;
    mode?: string;
    sectionScope?: string;
  };
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages" }, { status: 400 });
  }
  const mode: ChatMode = isChatMode(body.mode) ? body.mode : "agent";
  const sectionScope: ChatSectionScope = parseChatSectionScope(body.sectionScope);

  const access = await loadAccessibleReport(reportId, user);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { report } = access;
  // Plan mode never edits; Agent mode only when the report is still editable.
  const canEdit = mode === "agent" && access.canEdit;

  // Resolve the session (create one if the client didn't supply a valid id).
  let sessionId = body.sessionId?.trim() || "";
  if (sessionId) {
    const found = await findChatSession(reportId, sessionId);
    if (!found) sessionId = "";
  }
  if (!sessionId) {
    sessionId = (await createChatSession(reportId)).id;
  }

  // Persist the newest user turn (best-effort).
  const userMsg = lastUserMessage(messages);
  const userText = messageText(userMsg);
  const scopeMismatch = detectSectionScopeMismatch(sectionScope, userText);
  if (userMsg) {
    try {
      await db.insert(chatMessages).values({
        reportId,
        sessionId,
        role: "user",
        parts: userMsg.parts ?? [],
        authorId: user.id,
      });
      await touchChatSession(sessionId, userText || null);
    } catch (err) {
      console.error("chat: failed to persist user message", err);
    }
  }

  // Build the compact context map from current report state.
  const sectionRows = await db
    .select()
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId));
  const mergedSections: Partial<Record<SectionType, Record<string, unknown>>> = {};
  for (const row of sectionRows) {
    mergedSections[row.section] = mergeSection(row.section, row.content) as Record<
      string,
      unknown
    >;
  }
  const evaluations = await db
    .select()
    .from(criteriaEvaluations)
    .where(eq(criteriaEvaluations.reportId, reportId));
  const commentRows = await db
    .select()
    .from(comments)
    .where(eq(comments.reportId, reportId));

  const contextMap = buildReportContextMap({
    report: {
      deviationNo: report.deviationNo,
      date: report.date,
      status: report.status,
    },
    sections: mergedSections,
    evaluations: evaluations.map((e) => ({
      section: e.section,
      status: e.status,
      bypassed: e.bypassed,
    })),
    comments: commentRows.map((c) => ({
      section: c.section,
      kind: c.kind,
      status: c.status,
    })),
  });

  const system = buildChatSystemPrompt({
    contextMap,
    criteriaOutline: buildCriteriaOutline(sectionScope),
    mode,
    sectionScope,
    scopeMismatch,
  });

  const allTools = buildChatTools({ reportId, canEdit, sectionScope });
  const tools: ToolSet =
    mode === "plan"
      ? {
          read_section: allTools.read_section!,
          ...(allTools.suggest_section_scope
            ? { suggest_section_scope: allTools.suggest_section_scope }
            : {}),
        }
      : allTools;

  const model = isTestStubChat()
    ? await (async () => {
        const section =
          sectionScope !== "all" && isChatEditableSection(sectionScope)
            ? sectionScope
            : pickStubSection(userText);
        const targetField = primaryFieldForSection(section);
        return buildStubChatModel({
          mode,
          section,
          targetField,
          scopeMismatch,
          insertText: `Stubbed drafting insertion addressing "${userText.slice(0, 80)}". [Replace with real content once a Gemini credential is configured.]`,
          reasoning: "Demo stub proposal.",
        });
      })()
    : resolveChatLanguageModel();

  const result = streamText({
    model,
    system,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(mode === "plan" ? 4 : 8),
    ...langfuseGenerateTextTelemetry({
      functionId: "report-chat",
      metadata: { reportId, sessionId, mode, sectionScope, canEdit },
    }),
  });

  after(flushLangfuseTraces);

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ responseMessage }) => {
      try {
        await db.insert(chatMessages).values({
          reportId,
          sessionId,
          role: "assistant",
          parts: responseMessage.parts ?? [],
          authorId: null,
        });
        await touchChatSession(sessionId, null);
      } catch (err) {
        console.error("chat: failed to persist assistant message", err);
      }
    },
  });
}
