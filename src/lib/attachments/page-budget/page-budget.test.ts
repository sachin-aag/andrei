import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentPageBudgetExceededError } from "./errors";

vi.mock("./settings", () => ({
  getAttachmentPageBudgetSettings: vi.fn(),
}));

vi.mock("./record", () => ({
  getCurrentMonthCommittedPageCount: vi.fn(),
}));

vi.mock("./enforcement", () => ({
  isAttachmentPageBudgetTrackingSkipped: vi.fn(() => false),
}));

import { assertAttachmentPageBudgetAvailable } from "./assert";
import { getAttachmentPageBudgetSettings } from "./settings";
import { getCurrentMonthCommittedPageCount } from "./record";

describe("attachment page budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when committed pages plus request exceed the monthly limit", async () => {
    vi.mocked(getAttachmentPageBudgetSettings).mockResolvedValueOnce({
      monthlyPageLimit: 100_000,
      enforceHardLimit: true,
      warningThresholdPercent: 80,
      updatedAt: new Date(),
    });
    vi.mocked(getCurrentMonthCommittedPageCount).mockResolvedValueOnce(99_500);

    await expect(
      assertAttachmentPageBudgetAvailable({
        attachmentId: "att-1",
        pageCount: 600,
      })
    ).rejects.toBeInstanceOf(AttachmentPageBudgetExceededError);
  });

  it("allows ingest when under the monthly limit", async () => {
    vi.mocked(getAttachmentPageBudgetSettings).mockResolvedValueOnce({
      monthlyPageLimit: 100_000,
      enforceHardLimit: true,
      warningThresholdPercent: 80,
      updatedAt: new Date(),
    });
    vi.mocked(getCurrentMonthCommittedPageCount).mockResolvedValueOnce(50_000);

    await expect(
      assertAttachmentPageBudgetAvailable({
        attachmentId: "att-1",
        pageCount: 600,
      })
    ).resolves.toBeUndefined();
  });

  it("skips enforcement when hard limit is disabled", async () => {
    vi.mocked(getAttachmentPageBudgetSettings).mockResolvedValueOnce({
      monthlyPageLimit: 100_000,
      enforceHardLimit: false,
      warningThresholdPercent: 80,
      updatedAt: new Date(),
    });

    await expect(
      assertAttachmentPageBudgetAvailable({
        attachmentId: "att-1",
        pageCount: 200_000,
      })
    ).resolves.toBeUndefined();

    expect(getCurrentMonthCommittedPageCount).not.toHaveBeenCalled();
  });
});
