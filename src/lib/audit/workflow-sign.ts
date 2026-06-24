import { NextResponse } from "next/server";
import { verifyPasswordForSigning } from "./verify-password-for-signing";

export type SigningCredentials = {
  userId: string;
  password: string;
};

export async function parseSigningCredentialsFromRequest(
  req: Request
): Promise<Partial<SigningCredentials>> {
  try {
    const body = (await req.json()) as {
      password?: string;
      userId?: string;
      email?: string;
    };
    const userId =
      typeof body.userId === "string"
        ? body.userId.trim()
        : typeof body.email === "string"
          ? body.email.trim().toLowerCase()
          : "";
    const password = typeof body.password === "string" ? body.password : "";
    return { userId, password };
  } catch {
    return {};
  }
}

export async function requireSigningCredentials(
  sessionUser: { id: string; email: string },
  credentials: Partial<SigningCredentials>
): Promise<NextResponse | null> {
  const userId = credentials.userId?.trim().toLowerCase() ?? "";
  const password = credentials.password ?? "";

  if (!userId) {
    return NextResponse.json(
      { error: "User ID (email) is required to sign this action." },
      { status: 400 }
    );
  }
  if (!password) {
    return NextResponse.json(
      { error: "Password is required to sign this action." },
      { status: 400 }
    );
  }

  const sessionEmail = sessionUser.email.trim().toLowerCase();
  if (userId !== sessionUser.id && userId !== sessionEmail) {
    return NextResponse.json(
      { error: "User ID must match the signed-in user." },
      { status: 400 }
    );
  }

  const verified = await verifyPasswordForSigning(sessionUser.id, password);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }
  return null;
}

/** @deprecated Use requireSigningCredentials */
export async function parseSigningPasswordFromRequest(
  req: Request
): Promise<string | null> {
  const creds = await parseSigningCredentialsFromRequest(req);
  return creds.password ?? null;
}

/** @deprecated Use requireSigningCredentials */
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
