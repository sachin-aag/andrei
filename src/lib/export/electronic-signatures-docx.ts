import PizZip from "pizzip";
import { format } from "date-fns";

export type DocxAuditSignature = {
  signerName: string;
  meaning: string;
  signedAt: Date;
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphXml(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

/** Appends Part 11 electronic signature records to the end of document.xml. */
export function applyElectronicSignaturesToDocxZip(
  zip: PizZip,
  signatures: DocxAuditSignature[]
): void {
  if (signatures.length === 0) return;

  const docPath = "word/document.xml";
  const file = zip.file(docPath);
  if (!file) return;

  const xml = file.asText();
  const insertAt = xml.lastIndexOf("</w:body>");
  if (insertAt < 0) return;

  const lines = [
    "Electronic Signatures (21 CFR Part 11)",
    ...signatures.map(
      (s) =>
        `${s.signerName} — ${s.meaning} — ${format(s.signedAt, "yyyy-MM-dd HH:mm:ss 'UTC'")}`
    ),
  ];

  const block = lines.map((line) => paragraphXml(line)).join("");
  const next = xml.slice(0, insertAt) + block + xml.slice(insertAt);
  zip.file(docPath, next);
}
