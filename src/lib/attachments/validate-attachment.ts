import type { AttachmentKind } from "@/lib/attachments/file-types";
import { validateCsv } from "@/lib/attachments/validate-csv";
import { validateDocx } from "@/lib/attachments/validate-docx";
import { validatePdf } from "@/lib/attachments/validate-pdf";
import { validateXlsx } from "@/lib/attachments/validate-xlsx";

export type ValidateAttachmentResult = {
  pageCount: number;
};

export async function validateAttachmentBuffer(
  kind: AttachmentKind,
  buffer: Buffer,
  options: { maxPages: number }
): Promise<ValidateAttachmentResult> {
  switch (kind) {
    case "pdf":
      return validatePdf(buffer, { maxPages: options.maxPages });
    case "docx":
      return validateDocx(buffer);
    case "xlsx":
      return validateXlsx(buffer);
    case "csv":
      return validateCsv(buffer);
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported attachment kind: ${exhaustive}`);
    }
  }
}
