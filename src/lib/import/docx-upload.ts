export const MAX_DOCX_BYTES = 15 * 1024 * 1024;

export function docxUploadError(file: File): string | null {
  if (file.size > MAX_DOCX_BYTES) {
    return "Uploaded file is too large (max 15 MB)";
  }
  const lower = file.name.toLowerCase();
  if (
    !lower.endsWith(".docx") &&
    file.type !==
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "Only Word documents (.docx) are supported";
  }
  return null;
}

export async function readDocxUpload(file: File): Promise<Buffer> {
  const error = docxUploadError(file);
  if (error) throw new Error(error);
  return Buffer.from(await file.arrayBuffer());
}
