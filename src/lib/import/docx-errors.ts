export const DOCX_IMPORT_GENERIC_ERROR =
  "Could not read that Word file. Save as .docx and try again.";

export const DOCX_IMPORT_CREATE_GENERIC_ERROR =
  "Could not read that Word file. Save as .docx and try again, or create without a file.";

export function docxImportErrorPayload(
  e: unknown,
  options?: { createFlow?: boolean }
): { error: string; status: 400 } {
  const message = e instanceof Error ? e.message : "";
  if (message.includes("too large") || message.includes("Only Word")) {
    return { error: message, status: 400 };
  }
  return {
    error: options?.createFlow
      ? DOCX_IMPORT_CREATE_GENERIC_ERROR
      : DOCX_IMPORT_GENERIC_ERROR,
    status: 400,
  };
}
