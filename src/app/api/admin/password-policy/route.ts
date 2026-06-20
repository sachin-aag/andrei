import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getPasswordPolicy,
  updatePasswordExpiryDays,
} from "@/lib/auth/password-policy";
import { getCurrentUser } from "@/lib/auth/session";

const updateSchema = z.object({
  expiryDays: z.number().int().min(0).max(3650),
});

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "admin") {
    return {
      response: NextResponse.json(
        { error: "Only admins can manage password policy" },
        { status: 403 }
      ),
    };
  }
  return { response: null };
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const policy = await getPasswordPolicy();
  return NextResponse.json({ expiryDays: policy.expiryDays });
}

export async function PATCH(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const expiryDays = await updatePasswordExpiryDays(parsed.data.expiryDays);
    return NextResponse.json({ expiryDays });
  } catch {
    return NextResponse.json(
      { error: "Could not update password policy." },
      { status: 500 }
    );
  }
}
