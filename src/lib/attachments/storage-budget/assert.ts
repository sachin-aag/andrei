import { AttachmentStorageBudgetExceededError } from "./errors";
import { getAttachmentStorageUsageBytes } from "./usage";
import {
  getAttachmentStorageBudgetSettings,
  lockAttachmentStorageBudgetSettings,
} from "./settings";

type BudgetClient = NonNullable<
  Parameters<typeof getAttachmentStorageBudgetSettings>[0]
>;

export async function assertAttachmentStorageBudgetAvailable(
  requestedBytes: number,
  client?: BudgetClient
): Promise<void> {
  if (client) {
    await lockAttachmentStorageBudgetSettings(client);
  }

  const settings = await getAttachmentStorageBudgetSettings(client);
  if (!settings.enforceHardLimit) return;

  const usedBytes = await getAttachmentStorageUsageBytes(client);
  const requested = Math.max(0, requestedBytes);
  if (usedBytes + requested > settings.byteLimit) {
    throw new AttachmentStorageBudgetExceededError(
      settings.byteLimit,
      usedBytes,
      requested
    );
  }
}
