import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { retentionSettings } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";

const DEFAULT_RETENTION_DAYS = 2555;

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "admin") {
    return {
      user: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { user, response: null };
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const row = await db.query.retentionSettings.findFirst({
    where: eq(retentionSettings.id, "default"),
  });

  return NextResponse.json({
    reportRetentionDays: row?.reportRetentionDays ?? DEFAULT_RETENTION_DAYS,
  });
}

const updateSchema = z.object({
  reportRetentionDays: z.number().int().min(0).max(36500),
});

export async function PATCH(req: Request) {
  const { user, response } = await requireAdmin();
  if (response) return response;

  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const previous = await db.query.retentionSettings.findFirst({
    where: eq(retentionSettings.id, "default"),
  });

  const [updated] = await db
    .insert(retentionSettings)
    .values({
      id: "default",
      reportRetentionDays: parsed.data.reportRetentionDays,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: retentionSettings.id,
      set: {
        reportRetentionDays: parsed.data.reportRetentionDays,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (user) {
    await recordAuditEvent({
      actor: auditActorFromUser(user),
      action: "policy_updated",
      entityType: "policy",
      entityId: "retention",
      summary: "Updated retention settings",
      oldValue: {
        reportRetentionDays:
          previous?.reportRetentionDays ?? DEFAULT_RETENTION_DAYS,
      },
      newValue: { reportRetentionDays: updated.reportRetentionDays },
    });
  }

  return NextResponse.json({
    reportRetentionDays: updated.reportRetentionDays,
  });
}
