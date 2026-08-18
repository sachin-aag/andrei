import { NextResponse } from "next/server";
import { z } from "zod";
import {
  INGEST_CONTINUE_HEADER,
  MAX_INGEST_CONTINUATIONS,
  verifyIngestContinueToken,
} from "@/lib/attachments/ingest-continue";
import { scheduleInlineIngest } from "@/lib/attachments/start-ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  attachmentId: z.string().min(1),
  generation: z.string().min(1),
  slice: z.number().int().positive(),
});

export async function POST(req: Request) {
  const token = req.headers.get(INGEST_CONTINUE_HEADER);
  const verified = verifyIngestContinueToken(token);
  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (
    parsed.data.attachmentId !== verified.attachmentId ||
    parsed.data.generation !== verified.generation ||
    parsed.data.slice !== verified.slice
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (parsed.data.slice > MAX_INGEST_CONTINUATIONS) {
    return NextResponse.json({ error: "Too many continuations" }, { status: 409 });
  }

  scheduleInlineIngest(
    parsed.data.attachmentId,
    parsed.data.generation,
    parsed.data.slice
  );
  return NextResponse.json({ ok: true });
}
