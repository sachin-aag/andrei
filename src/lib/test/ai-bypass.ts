/**
 * Test-only flags for bypassing live LLM calls in E2E/CI.
 * Never set ALLOW_TEST_* on Vercel production or preview deployments.
 */

/** Stubs `evaluateSection()` (report editor + Improve AI) — skips Gemini. */
export function isTestSkipEvaluation(): boolean {
  return process.env.ALLOW_TEST_SKIP_EVALUATION === "true";
}

/** Stubs `generateSuggestionsForSection()` — skips Gemini. */
export function isTestSkipSuggestions(): boolean {
  return process.env.ALLOW_TEST_SKIP_SUGGESTIONS === "true";
}

/** Stubs legacy WMF math extraction in DOCX import — skips Gemini vision. */
export function isTestStubMathExtraction(): boolean {
  return process.env.ALLOW_TEST_STUB_MATH_EXTRACTION === "true";
}

export function isTestLoginEnabled(): boolean {
  return (
    process.env.ALLOW_TEST_LOGIN === "true" &&
    Boolean(process.env.TEST_AUTH_EMAIL)
  );
}
