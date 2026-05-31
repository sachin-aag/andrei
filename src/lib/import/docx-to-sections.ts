import mammoth from "mammoth";
import { enrichNarrativesFromDocxBuffer } from "@/lib/import/docx-rich-content";
import { extractSignatureBlockFromDocxBuffer } from "@/lib/docx/signature-block";
import { mapImportedWordComments } from "@/lib/import/docx-comment-mapping";
import {
  parseReportHeaderFromRaw,
  parseToolsUsed,
  parseToolsUsedFromDocxXml,
} from "@/lib/import/docx-header-tools";
import { mammothMarkdownToImportPlain } from "@/lib/import/docx-import-text";
import type {
  ImportedReportComment,
  ImportedReportContent,
  ImportedReportHeader,
  ImportedSections,
} from "@/lib/import/docx-import-types";
import {
  buildSectionsFromRaw,
  parseAnalyzeOtherToolsForTest,
} from "@/lib/import/docx-section-parser";
import { injectTablesFromHtml } from "@/lib/import/docx-table-injection";

export type { ImportedReportComment, ImportedReportContent, ImportedReportHeader, ImportedSections };
export { mammothMarkdownToImportPlain, buildSectionsFromRaw, parseReportHeaderFromRaw, parseAnalyzeOtherToolsForTest };

/** Runtime API; bundled mammoth `.d.ts` only lists `convertToHtml` / `extractRawText`. */
async function mammothConvertToMarkdown(buffer: Buffer): Promise<string> {
  const { value } = await (
    mammoth as typeof mammoth & {
      convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    }
  ).convertToMarkdown({ buffer });
  return value;
}

/**
 * Reads a .docx buffer and maps recognizable DMAIC blocks into section content.
 * Uses mammoth markdown conversion (normalized to plain text) so Word list numbering
 * is preserved; plain extractRawText omits automatic 1., 2., … prefixes.
 */
export async function docxBufferToImportedReportContent(
  buffer: Buffer
): Promise<ImportedReportContent> {
  const [markdown, { value: html }] = await Promise.all([
    mammothConvertToMarkdown(buffer),
    mammoth.convertToHtml({ buffer }),
  ]);
  const raw = mammothMarkdownToImportPlain(markdown);

  const sections = buildSectionsFromRaw(raw);

  injectTablesFromHtml(html, sections, buffer);
  await enrichNarrativesFromDocxBuffer(buffer, {
    define: sections.define,
    measure: sections.measure,
    improve: sections.improve,
    analyze: sections.analyze,
  });

  const signatureBlock = extractSignatureBlockFromDocxBuffer(buffer);
  if (signatureBlock) {
    sections.signature_approvals = {
      table: signatureBlock.table,
      headerRowXml: signatureBlock.headerRowXml,
      dataRowXml: signatureBlock.dataRowXml,
    };
  }

  return {
    sections,
    toolsUsed: parseToolsUsedFromDocxXml(buffer) ?? parseToolsUsed(raw),
    header: parseReportHeaderFromRaw(raw),
    comments: mapImportedWordComments(buffer, sections),
  };
}
