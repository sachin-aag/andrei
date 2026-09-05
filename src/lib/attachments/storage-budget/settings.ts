import { eq, sql } from "drizzle-orm";
import { attachmentStorageBudgetSettings } from "@/db/schema";

export const ATTACHMENT_STORAGE_BUDGET_SETTINGS_ID = "default";
/** 100 GiB. Stored as Postgres bigint; JS number stays exact below 2^53. */
export const BYTES_PER_GIB = 1024 * 1024 * 1024;
export const DEFAULT_ATTACHMENT_STORAGE_BYTE_LIMIT = 100 * BYTES_PER_GIB;
export const DEFAULT_ATTACHMENT_STORAGE_WARNING_THRESHOLD_PERCENT = 80;

export type AttachmentStorageBudgetSettings = {
  byteLimit: number;
  enforceHardLimit: boolean;
  warningThresholdPercent: number;
  updatedAt: Date;
};

type DbLike = {
  query: {
    attachmentStorageBudgetSettings: {
      findFirst: (args: {
        where: ReturnType<typeof eq>;
      }) => Promise<{
        byteLimit: number;
        enforceHardLimit: boolean;
        warningThresholdPercent: number;
        updatedAt: Date;
      } | undefined>;
    };
  };
  insert: (typeof import("@/db").db)["insert"];
  update: (typeof import("@/db").db)["update"];
  execute: (typeof import("@/db").db)["execute"];
  select: (typeof import("@/db").db)["select"];
};

async function resolveDb(client?: DbLike): Promise<DbLike> {
  if (client) return client;
  const { db } = await import("@/db");
  return db;
}

function toSettings(row: {
  byteLimit: number;
  enforceHardLimit: boolean;
  warningThresholdPercent: number;
  updatedAt: Date;
}): AttachmentStorageBudgetSettings {
  return {
    byteLimit: Number(row.byteLimit),
    enforceHardLimit: row.enforceHardLimit,
    warningThresholdPercent: row.warningThresholdPercent,
    updatedAt: row.updatedAt,
  };
}

export async function getAttachmentStorageBudgetSettings(
  client?: DbLike
): Promise<AttachmentStorageBudgetSettings> {
  const db = await resolveDb(client);
  const existing = await db.query.attachmentStorageBudgetSettings.findFirst({
    where: eq(
      attachmentStorageBudgetSettings.id,
      ATTACHMENT_STORAGE_BUDGET_SETTINGS_ID
    ),
  });
  if (existing) return toSettings(existing);

  await db.insert(attachmentStorageBudgetSettings).values({
    id: ATTACHMENT_STORAGE_BUDGET_SETTINGS_ID,
    byteLimit: DEFAULT_ATTACHMENT_STORAGE_BYTE_LIMIT,
    enforceHardLimit: true,
    warningThresholdPercent:
      DEFAULT_ATTACHMENT_STORAGE_WARNING_THRESHOLD_PERCENT,
  });

  return {
    byteLimit: DEFAULT_ATTACHMENT_STORAGE_BYTE_LIMIT,
    enforceHardLimit: true,
    warningThresholdPercent:
      DEFAULT_ATTACHMENT_STORAGE_WARNING_THRESHOLD_PERCENT,
    updatedAt: new Date(),
  };
}

/** Insert the singleton row if missing, then lock it for the rest of the tx. */
export async function lockAttachmentStorageBudgetSettings(
  client: DbLike
): Promise<void> {
  await getAttachmentStorageBudgetSettings(client);
  await client.execute(
    sql`select ${attachmentStorageBudgetSettings.id} from ${attachmentStorageBudgetSettings} where ${attachmentStorageBudgetSettings.id} = ${ATTACHMENT_STORAGE_BUDGET_SETTINGS_ID} for update`
  );
}

export async function updateAttachmentStorageBudgetSettings(input: {
  byteLimit?: number;
  enforceHardLimit?: boolean;
  warningThresholdPercent?: number;
}): Promise<AttachmentStorageBudgetSettings> {
  await getAttachmentStorageBudgetSettings();

  const { db } = await import("@/db");
  const [updated] = await db
    .update(attachmentStorageBudgetSettings)
    .set({
      ...(input.byteLimit !== undefined ? { byteLimit: input.byteLimit } : {}),
      ...(input.enforceHardLimit !== undefined
        ? { enforceHardLimit: input.enforceHardLimit }
        : {}),
      ...(input.warningThresholdPercent !== undefined
        ? { warningThresholdPercent: input.warningThresholdPercent }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      eq(
        attachmentStorageBudgetSettings.id,
        ATTACHMENT_STORAGE_BUDGET_SETTINGS_ID
      )
    )
    .returning();

  if (!updated) {
    throw new Error("Failed to update attachment storage budget settings");
  }

  return toSettings(updated);
}
