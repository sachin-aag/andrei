import PizZip from "pizzip";
import { format } from "date-fns";

export type DocxAuditSignature = {
  signerName: string;
  meaning: string;
  signedAt: Date;
  contentHash?: string | null;
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

const MEANING_LABEL: Record<string, string> = {
  submission: "Submitted for review",
  approval: "Approved investigation report",
  rejection: "Returned for feedback",
};

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
    ...signatures.flatMap((s) => {
      const meaning = MEANING_LABEL[s.meaning] ?? s.meaning;
      const timestamp = format(s.signedAt, "yyyy-MM-dd HH:mm:ss 'UTC'");
      const rows = [
        `${s.signerName} — ${meaning} — ${timestamp}`,
      ];
      if (s.contentHash) {
        rows.push(`Content hash (SHA-256): ${s.contentHash}`);
      }
      return rows;
    }),
  ];

  const block = lines.map((line) => paragraphXml(line)).join("");
  const next = xml.slice(0, insertAt) + block + xml.slice(insertAt);
  zip.file(docPath, next);
}
