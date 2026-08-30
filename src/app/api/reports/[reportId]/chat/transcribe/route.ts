import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import { voiceInputLanguageCodes } from "@/lib/customers/packs";
import { isTestStubSpeech } from "@/lib/test/ai-bypass";
import { encodeVoiceSse, type VoiceSseEvent } from "@/lib/voice/events";
import { openSpeechRecognizeStream } from "@/lib/voice/speech-stream";
import { streamStubVoiceEvents } from "@/lib/voice/stub-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reportId } = await params;
  const access = await loadAccessibleReport(reportId, user);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const languageCodes = voiceInputLanguageCodes();
  const body = request.body;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: VoiceSseEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeVoiceSse(event)));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      try {
        if (isTestStubSpeech()) {
          void body?.cancel();
          await streamStubVoiceEvents(emit);
          close();
          return;
        }

        if (!body) {
          emit({ type: "error", message: "Missing audio stream." });
          emit({ type: "done" });
          close();
          return;
        }

        const recognize = openSpeechRecognizeStream({
          languageCodes,
          onTranscript: emit,
          onError: (error) => {
            emit({
              type: "error",
              message: error.message || "Voice transcription failed.",
            });
            emit({ type: "done" });
            close();
          },
          onEnd: () => {
            emit({ type: "done" });
            close();
          },
        });

        const reader = body.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) recognize.writeAudio(value);
          }
        } finally {
          recognize.end();
        }
      } catch (error) {
        emit({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Voice transcription failed.",
        });
        emit({ type: "done" });
        close();
      }
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
