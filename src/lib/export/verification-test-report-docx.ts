import fs from "node:fs";
import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { reports as reportsTable } from "@/db/schema";
import { getDocumentType, mergeSectionForType } from "@/lib/document-types";
import { protocolModificationCountPhrase } from "@/lib/design-inputs/protocol-modifications";
import { requirementsVerifiedRows } from "@/lib/design-inputs/requirements-verified";
import type { Ledger, ModificationRow } from "@/lib/design-inputs/types";
import { asLedger } from "@/lib/document-types/verification-protocol/sections";
import {
  asTestReportDeviations,
  asTestReportMethods,
  asTestReportNarrative,
  asTestReportResults,
  asTestReportTable,
  REVISION_HISTORY_HEADERS,
  SOFTWARE_UNDER_TEST_HEADERS,
  type ProtocolModificationsSnapshot,
  type TestReportSectionKey,
} from "@/lib/document-types/verification-test-report/sections";
import { applyGoogleDocsImageCompat } from "@/lib/export/docx-google-docs-images";
import { applyInlineMediaToDocxZip } from "@/lib/export/docx-inline-media";
import {
  createDocxExportContext,
  type DocxExportContext,
} from "@/lib/export/docx-export-context";
import {
  applyElectronicSignaturesToDocxZip,
  type DocxAuditSignature,
} from "@/lib/export/electronic-signatures-docx";
import { applyNumberingToDocxZip, loadListNumberingBasesFromZip } from "@/lib/export/docx-numbering";
import { narrativeToDocxXmlWithContext } from "@/lib/export/narrative-to-docx-xml";
import { formatCalendarDate } from "@/lib/utils";
import { verificationTestReportMetadata, type ReportSectionRecord } from "@/types/report";

type ReportRow = typeof reportsTable.$inferSelect;
type ReportRowWithManagers = ReportRow & { assignedManagerIds?: string[] };

const REQUIREMENTS_VERIFIED_HEADERS = [
  "Req ID",
  "Description",
  "Satisfied by",
  "Required configs",
] as const;

const DEVIATION_HEADERS = [
  "No.",
  "Requirement IDs",
  "Observation",
  "Rationale",
  "Resolution",
  "Jira",
] as const;

const MODIFICATION_HEADERS = [
  "Finding",
  "Kind",
  "Target",
  "Before",
  "After",
  "Rationale",
] as const;

function headingDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text }],
      },
    ],
  };
}

function paragraphDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      },
    ],
  };
}

function headerRow(headers: readonly string[]): JSONContent {
  return {
    type: "tableRow",
    content: headers.map((text) => ({
      type: "tableHeader",
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text }],
        },
      ],
    })),
  };
}

function dataRow(cells: readonly string[], columnCount: number): JSONContent {
  return {
    type: "tableRow",
    content: Array.from({ length: columnCount }, (_, i) => ({
      type: "tableCell",
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [
        {
          type: "paragraph",
          content: cells[i] ? [{ type: "text", text: cells[i] }] : [],
        },
      ],
    })),
  };
}

function tableDoc(
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): JSONContent {
  const body =
    rows.length > 0
      ? rows.map((row) => dataRow(row, headers.length))
      : [dataRow([], headers.length)];
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [headerRow(headers), ...body],
      },
    ],
  };
}

function xmlFromDoc(doc: JSONContent, ctx: DocxExportContext): string {
  return narrativeToDocxXmlWithContext(doc, ctx).xml;
}

function joinXml(parts: string[]): string {
  return parts.filter((part) => part.length > 0).join("");
}

function mergedSection(
  byKey: Record<string, unknown>,
  key: TestReportSectionKey
): unknown {
  return mergeSectionForType("verification_test_report", key, byKey[key]);
}

function requirementsVerifiedDoc(ledger: Ledger): JSONContent {
  const rows = requirementsVerifiedRows(ledger).map((row) => [
    row.reqId,
    row.description,
    row.satisfiedBy,
    row.requiredConfigs.join(", "),
  ]);
  return tableDoc(REQUIREMENTS_VERIFIED_HEADERS, rows);
}

function deviationsDoc(
  items: {
    number: string;
    reqIds: string;
    observation: string;
    rationale: string;
    resolution: string;
    jira: string;
  }[]
): JSONContent {
  return tableDoc(
    DEVIATION_HEADERS,
    items.map((item) => [
      item.number,
      item.reqIds,
      item.observation,
      item.rationale,
      item.resolution,
      item.jira,
    ])
  );
}

function modificationRowsDoc(rows: ModificationRow[]): JSONContent {
  return tableDoc(
    MODIFICATION_HEADERS,
    rows.map((row) => [
      row.findingId,
      row.kind,
      row.target,
      row.before,
      row.after,
      row.rationale,
    ])
  );
}

function protocolModificationsXml(
  snapshot: ProtocolModificationsSnapshot | null,
  ctx: DocxExportContext
): string {
  if (!snapshot) {
    return xmlFromDoc(
      paragraphDoc(
        "No protocol modifications have been pulled from a source protocol."
      ),
      ctx
    );
  }
  const count = snapshot.rows.length;
  const phrase = protocolModificationCountPhrase(count);
  const verb = count === 1 ? "was" : "were";
  const noun = count === 1 ? "modification" : "modifications";
  return joinXml([
    xmlFromDoc(
      paragraphDoc(
        `There ${verb} ${phrase} ${noun} found during execution of the protocol. The count is computed from the accepted modification register at pull time.`
      ),
      ctx
    ),
    xmlFromDoc(modificationRowsDoc(snapshot.rows), ctx),
  ]);
}

function methodsXml(
  byKey: Record<string, unknown>,
  ctx: DocxExportContext
): string {
  const methods = asTestReportMethods(mergedSection(byKey, "methods_of_measurement"));
  return joinXml([
    xmlFromDoc(headingDoc("Executed protocol"), ctx),
    xmlFromDoc(methods.executedProtocol, ctx),
    xmlFromDoc(headingDoc("Protocol modifications"), ctx),
    protocolModificationsXml(methods.protocolModifications, ctx),
    xmlFromDoc(headingDoc("Units under test"), ctx),
    xmlFromDoc(methods.uuts, ctx),
    xmlFromDoc(headingDoc("Equipment"), ctx),
    xmlFromDoc(methods.equipment, ctx),
  ]);
}

function resultsXml(
  byKey: Record<string, unknown>,
  ctx: DocxExportContext
): string {
  const ledger = asLedger(mergedSection(byKey, "design_inputs"));
  const results = asTestReportResults(
    mergedSection(byKey, "results_discussion")
  );
  return joinXml([
    xmlFromDoc(headingDoc("Requirements Verified"), ctx),
    xmlFromDoc(requirementsVerifiedDoc(ledger), ctx),
    xmlFromDoc(headingDoc("Observations"), ctx),
    xmlFromDoc(results.observations, ctx),
  ]);
}

export async function generateVerificationTestReportDocx({
  report,
  sections,
  electronicSignatures,
}: {
  report: ReportRowWithManagers;
  sections: ReportSectionRecord[];
  electronicSignatures: DocxAuditSignature[];
}): Promise<Buffer> {
  const templateContent = fs.readFileSync(
    getDocumentType("verification_test_report").export.templatePath
  );
  const zip = new PizZip(templateContent);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
    nullGetter: () => "",
  });

  const numberingBases = loadListNumberingBasesFromZip(zip);
  const ctx = createDocxExportContext(numberingBases);
  const byKey = Object.fromEntries(sections.map((s) => [s.section, s.content]));
  const meta = verificationTestReportMetadata(report);

  const purpose = asTestReportNarrative(mergedSection(byKey, "purpose"));
  const scope = asTestReportNarrative(mergedSection(byKey, "scope"));
  const testers = asTestReportNarrative(mergedSection(byKey, "testers_dates"));
  const problem = asTestReportNarrative(
    mergedSection(byKey, "problem_failure_resolution")
  );
  const conclusion = asTestReportNarrative(mergedSection(byKey, "conclusion"));
  const software = asTestReportTable(
    mergedSection(byKey, "software_under_test"),
    SOFTWARE_UNDER_TEST_HEADERS
  );
  const revisionHistory = asTestReportTable(
    mergedSection(byKey, "revision_history"),
    REVISION_HISTORY_HEADERS
  );
  const deviations = asTestReportDeviations(mergedSection(byKey, "deviations"));

  const data: Record<string, string> = {
    date: formatCalendarDate(report.date),
    documentNo: report.documentNo,
    productName: meta.productName,
    revision: meta.revision,
    purposeXml: xmlFromDoc(purpose.narrative, ctx),
    scopeXml: xmlFromDoc(scope.narrative, ctx),
    softwareUnderTestXml: xmlFromDoc(software.table, ctx),
    testersDatesXml: xmlFromDoc(testers.narrative, ctx),
    methodsXml: methodsXml(byKey, ctx),
    deviationsXml: xmlFromDoc(deviationsDoc(deviations.items), ctx),
    resultsXml: resultsXml(byKey, ctx),
    problemXml: xmlFromDoc(problem.narrative, ctx),
    conclusionXml: xmlFromDoc(conclusion.narrative, ctx),
    revisionHistoryXml: xmlFromDoc(revisionHistory.table, ctx),
  };

  doc.render(data);
  applyElectronicSignaturesToDocxZip(doc.getZip(), electronicSignatures);
  applyNumberingToDocxZip(doc.getZip(), ctx);
  applyInlineMediaToDocxZip(doc.getZip(), ctx);
  await applyGoogleDocsImageCompat(doc.getZip());

  return doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}
