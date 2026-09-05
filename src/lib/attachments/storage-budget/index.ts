import { NextResponse } from "next/server";
import { AttachmentStorageBudgetExceededError } from "./errors";
import { getAttachmentStorageUsageBytes } from "./usage";
import {
  BYTES_PER_GIB,
  getAttachmentStorageBudgetSettings,
} from "./settings";

export { assertAttachmentStorageBudgetAvailable } from "./assert";
export {
  getAttachmentStorageBudgetSettings,
  updateAttachmentStorageBudgetSettings,
  lockAttachmentStorageBudgetSettings,
  BYTES_PER_GIB,
  DEFAULT_ATTACHMENT_STORAGE_BYTE_LIMIT,
  type AttachmentStorageBudgetSettings,
} from "./settings";
export { getAttachmentStorageUsageBytes } from "./usage";
export { AttachmentStorageBudgetExceededError } from "./errors";

export type AttachmentStorageBudgetStatus = {
  byteLimit: number;
  limitGb: number;
  enforceHardLimit: boolean;
  warningThresholdPercent: number;
  usedBytes: number;
  usedGb: number;
  percentUsed: number;
  isWarning: boolean;
  isOverBudget: boolean;
};

export function bytesToGb(bytes: number): number {
  return Math.round((bytes / BYTES_PER_GIB) * 10) / 10;
}

export function gbToBytes(limitGb: number): number {
  return Math.round(limitGb * BYTES_PER_GIB);
}

export async function getAttachmentStorageBudgetStatus(): Promise<AttachmentStorageBudgetStatus> {
  const [settings, usedBytes] = await Promise.all([
    getAttachmentStorageBudgetSettings(),
    getAttachmentStorageUsageBytes(),
  ]);
  const percentUsed =
    settings.byteLimit > 0
      ? Math.round((usedBytes / settings.byteLimit) * 1000) / 10
      : 0;

  return {
    byteLimit: settings.byteLimit,
    limitGb: bytesToGb(settings.byteLimit),
    enforceHardLimit: settings.enforceHardLimit,
    warningThresholdPercent: settings.warningThresholdPercent,
    usedBytes,
    usedGb: bytesToGb(usedBytes),
    percentUsed,
    isWarning: percentUsed >= settings.warningThresholdPercent,
    isOverBudget: usedBytes >= settings.byteLimit,
  };
}

export function attachmentStorageBudgetExceededResponse(
  error: AttachmentStorageBudgetExceededError
): NextResponse {
  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
      byteLimit: error.byteLimit,
      currentBytes: error.currentBytes,
      requestedBytes: error.requestedBytes,
    },
    { status: 429 }
  );
}

export function isAttachmentStorageBudgetExceededError(
  error: unknown
): error is AttachmentStorageBudgetExceededError {
  return error instanceof AttachmentStorageBudgetExceededError;
}
