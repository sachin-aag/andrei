import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import {
  getAiBudgetSettings,
  getAiBudgetStatus,
  updateAiBudgetSettings,
} from "@/lib/ai/usage";

const updateSchema = z
  .object({
    monthlyBudgetUsd: z.number().min(0).max(1_000_000).optional(),
    enforceHardLimit: z.boolean().optional(),
    warningThresholdPercent: z.number().int().min(1).max(100).optional(),
  })
  .refine(
    (value) =>
      value.monthlyBudgetUsd !== undefined ||
      value.enforceHardLimit !== undefined ||
      value.warningThresholdPercent !== undefined
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
        { error: "Only admins can manage AI budget settings" },
        { status: 403 }
      ),
      user: null,
    };
  }
  return { response: null, user };
}

function settingsPayload(
  settings: Awaited<ReturnType<typeof getAiBudgetSettings>>
) {
  return {
    monthlyBudgetUsd: settings.monthlyBudgetUsd,
    enforceHardLimit: settings.enforceHardLimit,
    warningThresholdPercent: settings.warningThresholdPercent,
  };
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const status = await getAiBudgetStatus();
  return NextResponse.json(status);
}

export async function PATCH(req: Request) {
  const { response, user: admin } = await requireAdmin();
  if (response) return response;

  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const previous = await getAiBudgetSettings();
    const settings = await updateAiBudgetSettings(parsed.data);
    const status = await getAiBudgetStatus();

    if (admin) {
      await recordAuditEvent({
        actor: auditActorFromUser(admin),
        action: "policy_updated",
        entityType: "policy",
        entityId: "ai-budget",
        summary: "Updated AI monthly budget settings",
        oldValue: settingsPayload(previous),
        newValue: settingsPayload(settings),
      });
    }

    return NextResponse.json(status);
  } catch {
    return NextResponse.json(
      { error: "Could not update AI budget settings." },
      { status: 500 }
    );
  }
}
