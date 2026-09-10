import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import {
  BYTES_PER_GIB,
  getAttachmentStorageBudgetSettings,
  getAttachmentStorageBudgetStatus,
  updateAttachmentStorageBudgetSettings,
} from "@/lib/attachments/storage-budget";

const MAX_LIMIT_GB = 10_000;

const updateSchema = z
  .object({
    limitGb: z.number().int().min(0).max(MAX_LIMIT_GB).optional(),
    byteLimit: z
      .number()
      .int()
      .min(0)
      .max(MAX_LIMIT_GB * BYTES_PER_GIB)
      .optional(),
    enforceHardLimit: z.boolean().optional(),
    warningThresholdPercent: z.number().int().min(1).max(100).optional(),
  })
  .refine(
    (value) =>
      value.limitGb !== undefined ||
      value.byteLimit !== undefined ||
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
        { error: "Only admins can manage attachment storage budget settings" },
        { status: 403 }
      ),
      user: null,
    };
  }
  return { response: null, user };
}

function settingsPayload(
  settings: Awaited<ReturnType<typeof getAttachmentStorageBudgetSettings>>
) {
  return {
    byteLimit: settings.byteLimit,
    enforceHardLimit: settings.enforceHardLimit,
    warningThresholdPercent: settings.warningThresholdPercent,
  };
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const status = await getAttachmentStorageBudgetStatus();
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
    const previous = await getAttachmentStorageBudgetSettings();
    const byteLimit =
      parsed.data.byteLimit ??
      (parsed.data.limitGb !== undefined
        ? parsed.data.limitGb * BYTES_PER_GIB
        : undefined);
    const settings = await updateAttachmentStorageBudgetSettings({
      ...(byteLimit !== undefined ? { byteLimit } : {}),
      ...(parsed.data.enforceHardLimit !== undefined
        ? { enforceHardLimit: parsed.data.enforceHardLimit }
        : {}),
      ...(parsed.data.warningThresholdPercent !== undefined
        ? { warningThresholdPercent: parsed.data.warningThresholdPercent }
        : {}),
    });
    const status = await getAttachmentStorageBudgetStatus();

    if (admin) {
      await recordAuditEvent({
        actor: auditActorFromUser(admin),
        action: "policy_updated",
        entityType: "policy",
        entityId: "attachment-storage-budget",
        summary: "Updated attachment storage budget settings",
        oldValue: settingsPayload(previous),
        newValue: settingsPayload(settings),
      });
    }

    return NextResponse.json(status);
  } catch {
    return NextResponse.json(
      { error: "Could not update attachment storage budget settings." },
      { status: 500 }
    );
  }
}
