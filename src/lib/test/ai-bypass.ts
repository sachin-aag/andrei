/** Test-only flags for bypassing live LLM calls in E2E/CI. Never enable in production. */

export function isTestSkipImproveAiEval(): boolean {
  return process.env.ALLOW_TEST_SKIP_IMPROVE_AI_EVAL === "true";
}

export function isTestSkipSuggestions(): boolean {
  return process.env.ALLOW_TEST_SKIP_SUGGESTIONS === "true";
}

export function isTestLoginEnabled(): boolean {
  return (
    process.env.ALLOW_TEST_LOGIN === "true" &&
    Boolean(process.env.TEST_AUTH_EMAIL)
  );
}
