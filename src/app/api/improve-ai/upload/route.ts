import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createReportFromDocxUpload } from "@/lib/improve-ai/create-report-from-docx";
import { createImproveAiSession } from "@/lib/improve-ai/store";
import { ImproveAiEvaluationError } from "@/lib/improve-ai/evaluate-report";
import { DUPLICATE_DEVIATION_NO_ERROR } from "@/lib/reports/deviation-no";
import { managerIdsFromFormData } from "@/lib/reports/managers";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const deviationNoRaw = form.get("deviationNo");
  const assignedManagerIds = managerIdsFromFormData(form);

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A .docx file is required" }, { status: 400 });
  }

  try {
    const created = await createReportFromDocxUpload({
      file,
      authorId: user.id,
      deviationNo:
        typeof deviationNoRaw === "string" ? deviationNoRaw : undefined,
      assignedManagerIds,
    });

    const session = await createImproveAiSession({
      reportId: created.reportId,
      userId: user.id,
      sourceType: "uploaded_docx",
      sourceLabel: created.filename,
      runEvaluation: true,
    });

    return NextResponse.json({
      sessionId: session.id,
      reportId: created.reportId,
      deviationNo: created.deviationNo,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    if (message === DUPLICATE_DEVIATION_NO_ERROR) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (e instanceof ImproveAiEvaluationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
