import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth/mock-users";
import { setSession } from "@/lib/auth/session";

const bodySchema = z.object({ userId: z.string() });

export async function POST(req: Request) {
  const parse = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const user = getUser(parse.data.userId);
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 401 });
  }
  await setSession(user.id);
  return NextResponse.json({ user });
}
