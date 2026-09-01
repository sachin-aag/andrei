import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { canSaveReportSection } from "@/lib/reports/access";
import { isValidSection } from "@/lib/document-types";
import { proofreadUnits } from "@/lib/ai/proofread/proofread";
import { resolveProofreadBudgetSkip } from "@/lib/ai/proofread/budget";
import { takeProofreadRateSlot } from "@/lib/ai/proofread/rate-limit";
import {
  PROOFREAD_MAX_CHARS,
  PROOFREAD_MAX_UNITS,
} from "@/lib/ai/proofread/prompts";
import type { ProofreadResult } from "@/lib/ai/proofread/types";
import {
  flushLangfuseTraces,
  observeRouteHandler,
  setRouteObservationIO,
} from "@/lib/observability/langfuse";

export const maxDuration = 30;

const bodySchema = z.object({
  section: z.string(),
  contentPath: z.string().min(1).max(80),
  units: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        text: z.string().min(1).max(PROOFREAD_MAX_CHARS),
      })
    )
    .max(PROOFREAD_MAX_UNITS),
});

function emptyResult(skipped: ProofreadResult["skipped"]): NextResponse {
  return NextResponse.json({ issues: [], skipped } satisfies ProofreadResult);
}

export const POST = observeRouteHandler(
  "report-inline-proofread",
  handleProofreadPost
);

async function handleProofreadPost(
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

  if (!canSaveReportSection(user, report)) {
    return emptyResult("read_only");
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!isValidSection(report.documentType, parsed.data.section)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }

  const units = parsed.data.units.map((unit) => ({
    id: unit.id,
    text: unit.text.trim(),
  }));
  const totalChars = units.reduce((sum, unit) => sum + unit.text.length, 0);
  if (totalChars > PROOFREAD_MAX_CHARS) {
    return NextResponse.json({ error: "Payload too large" }, { status: 400 });
  }
  if (units.length === 0 || totalChars === 0) {
    return emptyResult("empty");
  }

  if (!takeProofreadRateSlot(user.id)) {
    return emptyResult("rate_limit");
  }

  const budgetSkip = await resolveProofreadBudgetSkip();
  if (budgetSkip) {
    return emptyResult(budgetSkip);
  }

  try {
    const issues = await proofreadUnits({
      units,
      documentType: report.documentType,
      reportId,
      userId: user.id,
      signal: req.signal,
    });
    setRouteObservationIO({
      output: {
        reportId,
        section: parsed.data.section,
        issueCount: issues.length,
      },
    });
    after(() => {
      void flushLangfuseTraces();
    });
    return NextResponse.json({ issues } satisfies ProofreadResult);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return emptyResult("empty");
    }
    console.error("[inline-proofread] failed", error);
    return emptyResult("unavailable");
  }
}
