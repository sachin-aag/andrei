import {
  isTestSkipEvaluation,
  isTestSkipSuggestions,
  isTestStubChat,
  isTestStubDocumentIngest,
  isTestStubMathExtraction,
  isTestStubProofread,
} from "@/lib/test/ai-bypass";

/** Skip budget checks and usage persistence in CI/E2E stub modes. */
export function isAiBudgetTrackingSkipped(): boolean {
  return (
    isTestSkipEvaluation() ||
    isTestSkipSuggestions() ||
    isTestStubChat() ||
    isTestStubDocumentIngest() ||
    isTestStubMathExtraction() ||
    isTestStubProofread()
  );
}
