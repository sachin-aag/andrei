export class AiBudgetExceededError extends Error {
  readonly code = "ai_budget_exceeded" as const;
  readonly monthlyBudgetUsd: number;
  readonly currentSpendUsd: number;

  constructor(monthlyBudgetUsd: number, currentSpendUsd: number) {
    super(
      "This workspace has reached its monthly AI usage limit. Contact your administrator."
    );
    this.name = "AiBudgetExceededError";
    this.monthlyBudgetUsd = monthlyBudgetUsd;
    this.currentSpendUsd = currentSpendUsd;
  }
}
