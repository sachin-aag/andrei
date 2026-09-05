import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentStorageBudgetExceededError } from "./errors";

vi.mock("./settings", () => ({
  getAttachmentStorageBudgetSettings: vi.fn(),
  lockAttachmentStorageBudgetSettings: vi.fn(),
}));

vi.mock("./usage", () => ({
  getAttachmentStorageUsageBytes: vi.fn(),
}));

import { assertAttachmentStorageBudgetAvailable } from "./assert";
import {
  getAttachmentStorageBudgetSettings,
  lockAttachmentStorageBudgetSettings,
} from "./settings";
import { getAttachmentStorageUsageBytes } from "./usage";

const GIB = 1024 * 1024 * 1024;

describe("attachment storage budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when used bytes plus the upload exceed the workspace cap", async () => {
    vi.mocked(getAttachmentStorageBudgetSettings).mockResolvedValueOnce({
      byteLimit: 100 * GIB,
      enforceHardLimit: true,
      warningThresholdPercent: 80,
      updatedAt: new Date(),
    });
    vi.mocked(getAttachmentStorageUsageBytes).mockResolvedValueOnce(
      100 * GIB - 1000
    );

    await expect(
      assertAttachmentStorageBudgetAvailable(2000)
    ).rejects.toBeInstanceOf(AttachmentStorageBudgetExceededError);
  });

  it("allows an upload that still fits under the cap", async () => {
    vi.mocked(getAttachmentStorageBudgetSettings).mockResolvedValueOnce({
      byteLimit: 100 * GIB,
      enforceHardLimit: true,
      warningThresholdPercent: 80,
      updatedAt: new Date(),
    });
    vi.mocked(getAttachmentStorageUsageBytes).mockResolvedValueOnce(50 * GIB);

    await expect(
      assertAttachmentStorageBudgetAvailable(1024)
    ).resolves.toBeUndefined();
  });

  it("skips enforcement when the hard limit is off", async () => {
    vi.mocked(getAttachmentStorageBudgetSettings).mockResolvedValueOnce({
      byteLimit: 1,
      enforceHardLimit: false,
      warningThresholdPercent: 80,
      updatedAt: new Date(),
    });

    await expect(
      assertAttachmentStorageBudgetAvailable(100 * GIB)
    ).resolves.toBeUndefined();

    expect(getAttachmentStorageUsageBytes).not.toHaveBeenCalled();
  });

  it("locks the settings row when a transaction client is passed", async () => {
    const client = {} as never;
    vi.mocked(getAttachmentStorageBudgetSettings).mockResolvedValueOnce({
      byteLimit: 100 * GIB,
      enforceHardLimit: true,
      warningThresholdPercent: 80,
      updatedAt: new Date(),
    });
    vi.mocked(getAttachmentStorageUsageBytes).mockResolvedValueOnce(0);

    await assertAttachmentStorageBudgetAvailable(1, client);

    expect(lockAttachmentStorageBudgetSettings).toHaveBeenCalledWith(client);
  });
});
