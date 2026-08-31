/**
 * Test-only flags for bypassing live LLM calls in E2E/CI.
 * Never set ALLOW_TEST_* on Vercel production or preview deployments.
 */

/** Stubs `evaluateSection()` (report editor AI Check) — skips Gemini. */
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

/**
 * Marks attachments ready without calling Vertex/Workflow.
 * Never set ALLOW_TEST_STUB_DOCUMENT_INGEST on Vercel production or preview.
 */
export function isTestStubDocumentIngest(): boolean {
  return process.env.ALLOW_TEST_STUB_DOCUMENT_INGEST === "true";
}

/**
 * Drives the report drafting chat with a scripted mock model instead of Gemini.
 * Lets the whole chat → tool → suggestion → inline-diff spine run end-to-end
 * with no AI credential (E2E + local demo).
 */
export function isTestStubChat(): boolean {
  return process.env.ALLOW_TEST_STUB_CHAT === "true";
}

/**
 * Returns a canned composer dictation phrase instead of Cloud Speech-to-Text.
 * Never set ALLOW_TEST_STUB_SPEECH on Vercel production or preview.
 */
export function isTestStubSpeech(): boolean {
  return process.env.ALLOW_TEST_STUB_SPEECH === "true";
}

export function isTestLoginEnabled(): boolean {
  return (
    process.env.ALLOW_TEST_LOGIN === "true" &&
    Boolean(process.env.TEST_AUTH_EMAIL)
  );
}
