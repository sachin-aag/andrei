import { NextResponse } from "next/server";
import { after } from "next/server";
import { propagateAttributes } from "@langfuse/tracing";
import { eq, inArray, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reportSections, criteriaEvaluations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import {
  evaluateSection,
  evaluationContentHash,
  type AllSectionsContent,
} from "@/lib/ai/evaluate";
import { normalizeAnalyzeToolResults } from "@/lib/ai/evaluate-run-helpers";
import {
  getDocumentType,
  getEvaluatableSections,
  getGateSection,
  isValidSection,
  mergeSectionForType,
} from "@/lib/document-types";
import {
  hasEnoughContextInFirstSection,
  insufficientFirstSectionMessage,
} from "@/lib/ai/first-section-context";
import {
  flushLangfuseTraces,
  isLangfuseEnabled,
  observeRouteHandler,
  setRouteObservationIO,
} from "@/lib/observability/langfuse";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { requireReportAccess } from "@/lib/reports/require-report-access";

export const maxDuration = 60;

const bodySchema = z.object({
  sections: z.array(z.string()).optional(),
  reason: z.enum(["manual", "idle", "post-action"]).optional(),
});

export const POST = observeRouteHandler(
  "report-criteria-evaluate",
  handleEvaluatePost
);

async function handleEvaluatePost(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { report, user } = access;
  const documentType = report.documentType;
  const def = getDocumentType(documentType);
  const evaluatable = getEvaluatableSections(documentType).map((s) => s.key);

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  const requestedSections = parsed.success ? parsed.data.sections : undefined;

  const evalSet = new Set(evaluatable);
  const targetSections = (requestedSections ?? evaluatable)
    .filter((s) => isValidSection(documentType, s))
    .filter((s) => evalSet.has(s));

  const runEvaluation = async (): Promise<Response> => {
    const sectionRows = await db
      .select()
      .from(reportSections)
      .where(
        and(
          eq(reportSections.reportId, reportId),
          inArray(reportSections.section, targetSections)
        )
      );

    const allEvaluatableRows = await db
      .select()
      .from(reportSections)
      .where(
        and(
          eq(reportSections.reportId, reportId),
          inArray(reportSections.section, evaluatable)
        )
      );
    const bySection = new Map<string, (typeof allEvaluatableRows)[number]>();
    for (const row of allEvaluatableRows) bySection.set(row.section, row);

    const gate = getGateSection(documentType);
    if (gate) {
      if (documentType === "design_verification" && gate.key === "cover_page") {
        if (!String(report.documentNo ?? "").trim()) {
          return NextResponse.json(
            {
              error:
                "Add a document number on the cover page before running the AI check.",
            },
            { status: 400 }
          );
        }
      } else {
        const gateRow = bySection.get(gate.key);
        if (!hasEnoughContextInFirstSection(gateRow?.content)) {
          return NextResponse.json(
            { error: insufficientFirstSectionMessage(gate.label) },
            { status: 400 }
          );
        }
      }
    }

    const existingForSections = sectionRows.length
      ? await db
          .select()
          .from(criteriaEvaluations)
          .where(
            inArray(
              criteriaEvaluations.sectionId,
              sectionRows.map((r) => r.id)
            )
          )
      : [];
    const existingBySectionId = new Map<string, typeof existingForSections>();
    for (const row of existingForSections) {
      const arr = existingBySectionId.get(row.sectionId) ?? [];
      arr.push(row);
      existingBySectionId.set(row.sectionId, arr);
    }

    const allSections: AllSectionsContent = {};
    for (const row of allEvaluatableRows) {
      allSections[row.section] = mergeSectionForType(
        documentType,
        row.section,
        row.content
      );
    }

    const mergedFor = (row: (typeof sectionRows)[number]) =>
      allSections[row.section] ??
      mergeSectionForType(documentType, row.section, row.content);

    const llmResults = await Promise.all(
      sectionRows.map(async (row) => {
        const content =
          row.section === "cover_page" ? report.metadata : mergedFor(row);
        const evaluations = await evaluateSection({
          section: row.section,
          content,
          reportContext: { deviationNo: report.documentNo, date: report.date },
          allSections,
          documentType,
          report: report as never,
        });
        return {
          sectionRow: row,
          evaluations:
            documentType === "investigation_report" && row.section === "analyze"
              ? normalizeAnalyzeToolResults(content, evaluations)
              : evaluations,
        };
      })
    );

    for (const { sectionRow, evaluations } of llmResults) {
      const existing = existingBySectionId.get(sectionRow.id) ?? [];
      const existingByKey = new Map(existing.map((e) => [e.criterionKey, e]));
      const sectionCriteria = def.criteriaBySection[sectionRow.section] ?? [];
      const contentHash = evaluationContentHash({
        section: sectionRow.section,
        content:
          sectionRow.section === "cover_page"
            ? report.metadata
            : mergedFor(sectionRow),
        allSections,
        criteria: sectionCriteria,
        promptVersion: def.prompts.promptVersion,
      });

      for (const evalResult of evaluations) {
        const prior = existingByKey.get(evalResult.criterionKey);
        if (prior) {
          const keepBypass = prior.bypassed && evalResult.status !== "met";
          await db
            .update(criteriaEvaluations)
            .set({
              section: sectionRow.section,
              status: evalResult.status,
              criterionLabel: evalResult.criterionLabel,
              reasoning: evalResult.reasoning,
              bypassed: keepBypass,
              evaluatedContentHash: contentHash,
              updatedAt: new Date(),
            })
            .where(eq(criteriaEvaluations.id, prior.id));
        } else {
          await db.insert(criteriaEvaluations).values({
            reportId,
            sectionId: sectionRow.id,
            section: sectionRow.section,
            criterionKey: evalResult.criterionKey,
            criterionLabel: evalResult.criterionLabel,
            status: evalResult.status,
            reasoning: evalResult.reasoning,
            evaluatedContentHash: contentHash,
          });
        }
      }
    }

    const updatedEvals = await db
      .select()
      .from(criteriaEvaluations)
      .where(eq(criteriaEvaluations.reportId, reportId));

    await recordAuditEvent({
      actor: auditActorFromUser(user),
      action: "evaluation_run",
      entityType: "evaluation",
      entityId: reportId,
      reportId,
      summary: `AI evaluation run for ${targetSections.join(", ")}`,
      newValue: {
        sections: targetSections,
        evaluationCount: updatedEvals.length,
      },
      metadata: {
        reason: parsed.success ? parsed.data.reason ?? "manual" : "manual",
      },
    });

    setRouteObservationIO({
      output: {
        reportId,
        evaluationCount: updatedEvals.length,
        sectionsEvaluated: targetSections,
        statusBySection: llmResults.map(({ sectionRow, evaluations }) => ({
          section: sectionRow.section,
          met: evaluations.filter((e) => e.status === "met").length,
          partiallyMet: evaluations.filter((e) => e.status === "partially_met")
            .length,
          notMet: evaluations.filter((e) => e.status === "not_met").length,
          notEvaluated: evaluations.filter((e) => e.status === "not_evaluated")
            .length,
        })),
      },
    });

    return NextResponse.json({
      evaluations: updatedEvals,
      overflowCounts: {},
    });
  };

  if (!isLangfuseEnabled()) return runEvaluation();

  setRouteObservationIO({
    input: {
      reportId,
      sections: targetSections,
      documentNo: report.documentNo,
      reason: parsed.success ? parsed.data.reason ?? null : null,
    },
  });
  after(flushLangfuseTraces);

  return propagateAttributes(
    {
      sessionId: reportId,
      userId: user.id,
      traceName: "report-criteria-evaluate",
      tags: ["criteria-evaluation"],
      metadata: {
        feature: "criteria-evaluation",
        documentNo: report.documentNo,
      },
    },
    runEvaluation
  );
}
