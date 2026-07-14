import { NextResponse, after } from "next/server";
import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  reports,
  reportSections,
  criteriaEvaluations,
  comments,
  chatMessages,
} from "@/db/schema";
import type { SectionType } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { mergeSection } from "@/lib/sections-merge";
import { buildReportContextMap } from "@/lib/ai/chat/context-map";
import { buildChatSystemPrompt } from "@/lib/ai/chat/system-prompt";
import { buildChatTools } from "@/lib/ai/chat/tools";
import { resolveChatLanguageModel } from "@/lib/ai/chat/model";
import { buildStubChatModel } from "@/lib/ai/chat/stub-model";
import { primaryFieldForSection } from "@/lib/ai/chat/fields";
import { isTestStubChat } from "@/lib/test/ai-bypass";
import {
  flushLangfuseTraces,
  langfuseGenerateTextTelemetry,
} from "@/lib/observability/langfuse";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

export const maxDuration = 120;

type ReportRow = typeof reports.$inferSelect;

function canAccessReport(user: WorkspaceUser, report: ReportRow): boolean {
  if (user.id === report.authorId) return true;
  if (report.assignedManagerId && report.assignedManagerId === user.id) return true;
  return user.role === "admin" || user.role === "qa" || user.role === "manager";
}

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
  const t = text.toLowerCase();
  if (/\b(measure|measurement plan|experiment)\b/.test(t)) return "measure";
  if (/\b(analyze|analyse|root cause|5[-\s]?why|fishbone|6m)\b/.test(t)) return "analyze";
  if (/\b(improve|corrective|capa)\b/.test(t)) return "improve";
  if (/\b(control|preventive)\b/.test(t)) return "control";
  if (/\bconclusion\b/.test(t)) return "conclusion";
  return "define";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reportId } = await params;

  const body = (await req.json().catch(() => ({}))) as { messages?: UIMessage[] };
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages" }, { status: 400 });
  }

  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessReport(user, report)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const canEdit = report.status !== "approved";

  // Persist the newest user turn (best-effort).
  const userMsg = lastUserMessage(messages);
  if (userMsg) {
    try {
      await db.insert(chatMessages).values({
        reportId,
        role: "user",
        parts: userMsg.parts ?? [],
        authorId: user.id,
      });
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

  const system = buildChatSystemPrompt(contextMap);
  const tools = buildChatTools({ reportId, canEdit });

  const model = isTestStubChat()
    ? await (async () => {
        const text = messageText(userMsg);
        const section = pickStubSection(text);
        const targetField = primaryFieldForSection(section);
        return buildStubChatModel({
          section,
          targetField,
          insertText: `Stubbed drafting insertion addressing "${text.slice(0, 80)}". [Replace with real content once a Gemini credential is configured.]`,
          reasoning: "Demo stub proposal.",
          summaryText: `I proposed an addition to the ${section} section — review the highlighted insertion in the document and accept or reject it.`,
        });
      })()
    : resolveChatLanguageModel();

  const result = streamText({
    model,
    system,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(6),
    ...langfuseGenerateTextTelemetry({
      functionId: "report-chat",
      metadata: { reportId, canEdit },
    }),
  });

  after(flushLangfuseTraces);

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ responseMessage }) => {
      try {
        await db.insert(chatMessages).values({
          reportId,
          role: "assistant",
          parts: responseMessage.parts ?? [],
          authorId: null,
        });
      } catch (err) {
        console.error("chat: failed to persist assistant message", err);
      }
    },
  });
}
