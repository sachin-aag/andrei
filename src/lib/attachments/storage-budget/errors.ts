export class AttachmentStorageBudgetExceededError extends Error {
  readonly code = "attachment_storage_budget_exceeded" as const;
  readonly byteLimit: number;
  readonly currentBytes: number;
  readonly requestedBytes: number;

  constructor(byteLimit: number, currentBytes: number, requestedBytes: number) {
    super(
      "This workspace has reached its attachment storage limit. Contact your administrator."
    );
    this.name = "AttachmentStorageBudgetExceededError";
    this.byteLimit = byteLimit;
    this.currentBytes = currentBytes;
    this.requestedBytes = requestedBytes;
  }
}
