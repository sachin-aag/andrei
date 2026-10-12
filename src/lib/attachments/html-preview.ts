import { docxBufferToPreviewHtml } from "@/lib/attachments/docx-preview";
import type { AttachmentKind } from "@/lib/attachments/file-types";
import { usesHtmlPreview } from "@/lib/attachments/file-types";
import { spreadsheetBufferToPreviewHtml } from "@/lib/attachments/spreadsheet-preview";

export async function attachmentBufferToPreviewHtml(
  kind: AttachmentKind,
  buffer: Buffer,
  options: { title?: string } = {}
): Promise<string> {
  if (!usesHtmlPreview(kind)) {
    throw new Error("Preview is only available for Word, CSV, and Excel files");
  }
  switch (kind) {
    case "docx":
      return docxBufferToPreviewHtml(buffer, options);
    case "csv":
    case "xlsx":
      return spreadsheetBufferToPreviewHtml(kind, buffer, options);
    case "pdf":
      throw new Error("Preview is only available for Word, CSV, and Excel files");
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported preview kind: ${exhaustive}`);
    }
  }
}
