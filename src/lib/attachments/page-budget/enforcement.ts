import { isTestStubDocumentIngest } from "@/lib/test/ai-bypass";

/** Skip page-budget checks and usage persistence in CI/E2E stub modes. */
export function isAttachmentPageBudgetTrackingSkipped(): boolean {
  return isTestStubDocumentIngest();
}
