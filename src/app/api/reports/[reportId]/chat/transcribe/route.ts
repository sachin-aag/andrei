import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import { encodeVoiceSse } from "@/lib/voice/events";
import {
  createVoiceSession,
  getVoiceSession,
  stopVoiceSession,
  subscribeVoiceSession,
  writeVoiceAudio,
} from "@/lib/voice/sessions";

export const runtime = "nodejs";
export const maxDuration = 300;
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

export async function GET(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const auth = await authorize(reportId);
  if (auth.error) return auth.error;

  const sessionId = new URL(request.url).searchParams.get("session");
  if (!sessionId) {
    return new NextResponse(null, { status: 204 });
  }

  const session = getVoiceSession(sessionId, reportId, auth.user.id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let unsubscribe: () => void = () => {};
      const send = (event: Parameters<typeof encodeVoiceSse>[0]) => {
        try {
          controller.enqueue(encoder.encode(encodeVoiceSse(event)));
          if (event.type === "done") {
            unsubscribe();
            controller.close();
          }
        } catch {
          unsubscribe();
        }
      };
      unsubscribe = subscribeVoiceSession(session, send);
      request.signal.addEventListener(
        "abort",
        () => {
          unsubscribe();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
        { once: true }
      );
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const auth = await authorize(reportId);
  if (auth.error) return auth.error;

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/octet-stream")) {
    const sessionId = request.headers.get("x-voice-session");
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session" }, { status: 400 });
    }
    const session = getVoiceSession(sessionId, reportId, auth.user.id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > 0) {
      writeVoiceAudio(session, bytes);
    }
    return new NextResponse(null, { status: 204 });
  }

  let action: "start" | "stop" = "start";
  let sessionId: string | null = null;
  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as {
        action?: string;
        sessionId?: string;
      };
      if (body.action === "stop") action = "stop";
      if (typeof body.sessionId === "string") sessionId = body.sessionId;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  if (action === "stop") {
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session" }, { status: 400 });
    }
    const session = getVoiceSession(sessionId, reportId, auth.user.id);
    if (session) stopVoiceSession(session);
    return new NextResponse(null, { status: 204 });
  }

  const session = createVoiceSession(reportId, auth.user.id);
  return NextResponse.json({ sessionId: session.id });
}
