import type { auditEvents } from "@/db/schema";
import { auditEventsToCsv } from "./audit-csv";
import { verifyAuditChain } from "./verify-audit-chain";

type AuditRow = typeof auditEvents.$inferSelect;

export { auditEventsToCsv } from "./audit-csv";

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Minimal PDF: plain text wrapped in PDF objects (no external deps). */
export function auditEventsToPdfText(
  events: AuditRow[],
  chainStatus: Awaited<ReturnType<typeof verifyAuditChain>>
): Uint8Array {
  const lines: string[] = [
    "M.J. Biopharm — Audit Trail Export",
    `Generated: ${new Date().toISOString()}`,
    `Chain verification: ${chainStatus.message}`,
    "",
  ];

  for (const e of events) {
    const ts =
      e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt);
    lines.push(`[${e.seq}] ${ts}`);
    lines.push(`  Actor: ${e.actorName} (${e.actorId}, ${e.actorRole})`);
    lines.push(`  Action: ${e.action} on ${e.entityType}/${e.entityId}`);
    if (e.reportId) lines.push(`  Report: ${e.reportId}`);
    lines.push(`  Summary: ${e.summary}`);
    if (e.oldValue) lines.push(`  Old: ${formatJson(e.oldValue)}`);
    if (e.newValue) lines.push(`  New: ${formatJson(e.newValue)}`);
    lines.push("");
  }

  return buildSimplePdf(lines.join("\n"));
}

function buildSimplePdf(text: string): Uint8Array {
  const sanitized = text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
  const contentLines = sanitized.split("\n").map((line) => {
    const escaped = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    return `(${escaped}) Tj T*`;
  });

  const stream = [
    "BT",
    "/F1 9 Tf",
    "50 750 Td",
    "14 TL",
    ...contentLines,
    "ET",
  ].join("\n");

  const streamBytes = Buffer.from(stream, "utf8");

  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj",
    `4 0 obj<< /Length ${streamBytes.length} >>stream\n${stream}\nendstream endobj`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj + "\n";
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return new Uint8Array(Buffer.from(pdf, "utf8"));
}

export async function exportAuditEventsCsv(events: AuditRow[]) {
  const chain = await verifyAuditChain();
  const csv = auditEventsToCsv(events);
  const header = `# chain_valid=${chain.valid}; ${chain.message}\n`;
  return header + csv;
}

export async function exportAuditEventsPdf(events: AuditRow[]) {
  const chain = await verifyAuditChain();
  return auditEventsToPdfText(events, chain);
}
