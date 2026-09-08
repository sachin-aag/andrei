/** Workspace-level attachment limit errors (storage or page budget). */
export function isAttachmentQuotaError(message: string): boolean {
  return (
    /attachment storage limit/i.test(message) ||
    /monthly attachment page processing limit/i.test(message)
  );
}
