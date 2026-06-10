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

export function isTestLoginEnabled(): boolean {
  return (
    process.env.ALLOW_TEST_LOGIN === "true" &&
    Boolean(process.env.TEST_AUTH_EMAIL)
  );
}
