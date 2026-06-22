import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getPasswordPolicy,
  updatePasswordPolicySettings,
} from "@/lib/auth/password-policy";
import {
  MAX_INACTIVITY_TIMEOUT_MINUTES,
  MIN_INACTIVITY_TIMEOUT_MINUTES,
} from "@/lib/auth/inactivity-timeout";
import { getCurrentUser } from "@/lib/auth/session";

const updateSchema = z
  .object({
    expiryDays: z.number().int().min(0).max(3650).optional(),
    inactivityTimeoutMinutes: z
      .number()
      .int()
      .min(MIN_INACTIVITY_TIMEOUT_MINUTES)
      .max(MAX_INACTIVITY_TIMEOUT_MINUTES)
      .optional(),
  })
  .refine(
    (value) =>
      value.expiryDays !== undefined ||
      value.inactivityTimeoutMinutes !== undefined
  );

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
  return NextResponse.json({
    expiryDays: policy.expiryDays,
    inactivityTimeoutMinutes: policy.inactivityTimeoutMinutes,
  });
}

export async function PATCH(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const policy = await updatePasswordPolicySettings(parsed.data);
    return NextResponse.json({
      expiryDays: policy.expiryDays,
      inactivityTimeoutMinutes: policy.inactivityTimeoutMinutes,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not update password policy." },
      { status: 500 }
    );
  }
}
