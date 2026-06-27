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
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";

const updateSchema = z
  .object({
    expiryDays: z.number().int().min(0).max(3650).optional(),
    inactivityTimeoutMinutes: z
      .number()
      .int()
      .min(MIN_INACTIVITY_TIMEOUT_MINUTES)
      .max(MAX_INACTIVITY_TIMEOUT_MINUTES)
      .optional(),
    warningDays: z.number().int().min(0).max(365).optional(),
    failedLoginAttemptLimit: z.number().int().min(1).max(20).optional(),
    passwordHistoryLimit: z.number().int().min(0).max(24).optional(),
  })
  .refine(
    (value) =>
      value.expiryDays !== undefined ||
      value.inactivityTimeoutMinutes !== undefined ||
      value.warningDays !== undefined ||
      value.failedLoginAttemptLimit !== undefined ||
      value.passwordHistoryLimit !== undefined
  );

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null,
    };
  }
  if (user.role !== "admin") {
    return {
      response: NextResponse.json(
        { error: "Only admins can manage password policy" },
        { status: 403 }
      ),
      user: null,
    };
  }
  return { response: null, user };
}

function policyPayload(policy: Awaited<ReturnType<typeof getPasswordPolicy>>) {
  return {
    expiryDays: policy.expiryDays,
    inactivityTimeoutMinutes: policy.inactivityTimeoutMinutes,
    warningDays: policy.warningDays,
    failedLoginAttemptLimit: policy.failedLoginAttemptLimit,
    passwordHistoryLimit: policy.passwordHistoryLimit,
  };
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const policy = await getPasswordPolicy();
  return NextResponse.json(policyPayload(policy));
}

export async function PATCH(req: Request) {
  const { response, user: admin } = await requireAdmin();
  if (response) return response;

  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const previous = await getPasswordPolicy();
    const policy = await updatePasswordPolicySettings(parsed.data);

    if (admin) {
      await recordAuditEvent({
        actor: auditActorFromUser(admin),
        action: "policy_updated",
        entityType: "policy",
        entityId: "default",
        summary: "Updated password policy",
        oldValue: policyPayload(previous),
        newValue: policyPayload(policy),
      });
    }

    return NextResponse.json(policyPayload(policy));
  } catch {
    return NextResponse.json(
      { error: "Could not update password policy." },
      { status: 500 }
    );
  }
}
