import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import {
  clampPresenceSeconds,
  recordPresenceSeconds,
} from "@/lib/usage/activity";

const bodySchema = z.object({
  seconds: z.number().finite(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const seconds = clampPresenceSeconds(parsed.data.seconds);
  if (seconds < 1) {
    return NextResponse.json({ ok: true, seconds: 0 });
  }

  try {
    await recordPresenceSeconds(user.id, seconds);
    return NextResponse.json({ ok: true, seconds });
  } catch (error) {
    console.error("presence heartbeat failed", error);
    return NextResponse.json({ error: "Could not record presence" }, { status: 500 });
  }
}
