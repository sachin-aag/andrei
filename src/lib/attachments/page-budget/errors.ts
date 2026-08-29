export class AttachmentPageBudgetExceededError extends Error {
  readonly code = "attachment_page_budget_exceeded" as const;
  readonly monthlyPageLimit: number;
  readonly currentPageCount: number;
  readonly requestedPageCount: number;

  constructor(
    monthlyPageLimit: number,
    currentPageCount: number,
    requestedPageCount: number
  ) {
    super(
      "This workspace has reached its monthly attachment page processing limit. Contact your administrator."
    );
    this.name = "AttachmentPageBudgetExceededError";
    this.monthlyPageLimit = monthlyPageLimit;
    this.currentPageCount = currentPageCount;
    this.requestedPageCount = requestedPageCount;
  }
}
