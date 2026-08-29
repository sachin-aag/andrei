import { getAttachmentPageBudgetSettings } from "./settings";
import { getCurrentMonthCommittedPageCount } from "./record";
import { isAttachmentPageBudgetTrackingSkipped } from "./enforcement";
import { AttachmentPageBudgetExceededError } from "./errors";

export async function assertAttachmentPageBudgetAvailable(input: {
  attachmentId: string;
  pageCount: number;
}): Promise<void> {
  if (isAttachmentPageBudgetTrackingSkipped()) return;

  const settings = await getAttachmentPageBudgetSettings();
  if (!settings.enforceHardLimit) return;

  const requestedPages = Math.max(1, input.pageCount);
  const committedPages = await getCurrentMonthCommittedPageCount({
    excludeAttachmentId: input.attachmentId,
  });

  if (committedPages + requestedPages > settings.monthlyPageLimit) {
    throw new AttachmentPageBudgetExceededError(
      settings.monthlyPageLimit,
      committedPages,
      requestedPages
    );
  }
}
