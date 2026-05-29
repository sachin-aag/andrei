import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { setSiteAccessCookie } from "@/lib/site-access-cookie";
import { mintSiteAccessToken } from "@/lib/site-access-token";

const bodySchema = z.object({ password: z.string() });

function passwordMatches(expected: string, given: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = process.env.SITE_ACCESS_PASSWORD?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Site access is not configured" },
      { status: 503 },
    );
  }

  const parse = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!passwordMatches(secret, parse.data.password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = await mintSiteAccessToken(secret);
  await setSiteAccessCookie(token);
  return NextResponse.json({ ok: true });
}
