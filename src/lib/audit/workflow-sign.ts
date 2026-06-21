import { NextResponse } from "next/server";
import { verifyPasswordForSigning } from "./verify-password-for-signing";

export async function parseSigningPasswordFromRequest(
  req: Request
): Promise<string | null> {
  try {
    const body = (await req.json()) as { password?: string };
    return typeof body.password === "string" ? body.password : null;
  } catch {
    return null;
  }
}

export async function requireSigningPassword(
  workspaceUserId: string,
  password: string | null
): Promise<NextResponse | null> {
  if (!password) {
    return NextResponse.json(
      { error: "Password is required to sign this action." },
      { status: 400 }
    );
  }
  const verified = await verifyPasswordForSigning(workspaceUserId, password);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }
  return null;
}
