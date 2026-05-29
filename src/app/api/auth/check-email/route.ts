import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";

const ALLOWED_DOMAINS = ["@mjbiopharm.com"];
const ALLOWED_EMAILS = ["sachinagrawal272@gmail.com", "aditya.ambani@gmail.com"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
  if (!email) return NextResponse.json({ allowed: false });

  const domainAllowed =
    ALLOWED_EMAILS.includes(email) ||
    ALLOWED_DOMAINS.some((d) => email.endsWith(d));
  if (!domainAllowed) return NextResponse.json({ allowed: false });

  const wsUser = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, email),
    columns: { id: true },
  });
  return NextResponse.json({ allowed: !!wsUser });
}
