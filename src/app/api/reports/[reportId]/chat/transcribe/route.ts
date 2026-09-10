import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import {
  aiBudgetExceededResponse,
  assertAiBudgetAvailable,
  isAiBudgetExceededError,
} from "@/lib/ai/usage";
import { voiceInputLanguageCodes } from "@/lib/customers";
import {
  assertVoiceBudgetAvailable,
  isVoiceBudgetExceededError,
  voiceBudgetExceededResponse,
} from "@/lib/voice/budget";
import { resolveVoiceLanguageCodes } from "@/lib/voice/languages";
import { recognizePcmWindow } from "@/lib/voice/speech-stream";
import { voiceUserErrorMessage } from "@/lib/voice/user-error";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ reportId: string }> };

async function authorize(reportId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const access = await loadAccessibleReport(reportId, user);
  if (!access) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { user };
}

function languageCodesFromRequest(request: Request): readonly string[] {
  const raw = request.headers.get("x-voice-languages");
  if (!raw?.trim()) return voiceInputLanguageCodes();
  return resolveVoiceLanguageCodes(
    raw.split(",").map((code) => code.trim()),
    voiceInputLanguageCodes()
  );
}

function budgetErrorResponse(error: unknown): NextResponse | null {
  if (isVoiceBudgetExceededError(error)) {
    return voiceBudgetExceededResponse(error);
  }
  if (isAiBudgetExceededError(error)) {
    return aiBudgetExceededResponse(error);
  }
  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const auth = await authorize(reportId);
  if (auth.error) return auth.error;

  try {
    await assertVoiceBudgetAvailable({ audioSeconds: 1 });
    await assertAiBudgetAvailable();
  } catch (error) {
    const budget = budgetErrorResponse(error);
    if (budget) return budget;
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}

export async function POST(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const auth = await authorize(reportId);
  if (auth.error) return auth.error;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return NextResponse.json({ ok: true });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  try {
    const result = await recognizePcmWindow({
      pcm: bytes,
      languageCodes: languageCodesFromRequest(request),
      reportId,
      userId: auth.user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    const budget = budgetErrorResponse(error);
    if (budget) return budget;
    console.error("voice-transcribe: recognize failed", error);
    return NextResponse.json(
      { error: voiceUserErrorMessage(error) },
      { status: 502 }
    );
  }
}
