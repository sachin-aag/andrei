export const ANALYTICS_PAGE_NUMBER_ASK_MESSAGE =
  "Do not ask which page to read. Call scan_attachments or search_documents, then read or extract. If nothing matches, say you did not find it.";

/** "Which page is FN-037 on?" — the engineer should never see this form. */
const PAGE_NUMBER_QUESTION_RE =
  /\b(?:which|what|where)\s+pages?\b|\bpage\s+(?:number|no\.?|to read)\b|\bon\s+which\s+page\b|\bwhat\s+page\b/i;

export function isPageNumberQuestion(question: string): boolean {
  return PAGE_NUMBER_QUESTION_RE.test(question.trim());
}

export function rejectPageNumberAskUserQuestions<
  T extends { question: string },
>(questions: readonly T[]): {
  kept: T[];
  rejected: T[];
} {
  const kept: T[] = [];
  const rejected: T[] = [];
  for (const question of questions) {
    if (isPageNumberQuestion(question.question)) rejected.push(question);
    else kept.push(question);
  }
  return { kept, rejected };
}
