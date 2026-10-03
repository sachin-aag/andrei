import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  MIN_TEXT_LAYER_CHARS,
  readPdfTextLayer,
} from "@/lib/attachments/pdf-text-layer";

export const PROTOCOL_EQUIPMENT_FILENAME = "dv-protocol-equipment.pdf";
export const SOFTWARE_REQUIREMENTS_FILENAME = "software-requirements.pdf";

export const RETRIEVAL_EVAL_GCS_PREFIX = "retrieval-eval/";

export const CORPUS_FILENAMES = [
  PROTOCOL_EQUIPMENT_FILENAME,
  SOFTWARE_REQUIREMENTS_FILENAME,
] as const;

export const PROTOCOL_PAGES = {
  header: 1,
  requiredEquipment: 2,
  executedLog: 3,
} as const;

export const SOFTWARE_PAGES = {
  cover: 1,
  requirements: 2,
  /** Drawn minus before 15 °C; text layer is unsigned. */
  ursShell: 3,
} as const;

/** Phrases the generated PDFs must contain — used by fixture tests and judge criteria. */
export const CORPUS_ANCHORS = {
  spectrumAnalyzer: "Portable Spectrum Analyzer",
  narda: "Narda SRM-3006",
  requiredTable: "Required Testing Equipment",
  executedLog: "EXECUTED Equipment Data Table",
  torqueWrench: "Torque Wrench",
  sturtevant: "Sturtevant",
  digitalCalipers: "Digital Calipers",
  swEval7: "SW-EVAL-7",
  interlock: "Laser interlock latency",
  pmcPr014: "PMC/PR/014",
  sopDpQa014: "SOP/DP/QA/014",
  urs3: "URS-3",
  unsignedShellRange: "15 °C to 130 °C",
  approxRpm: "~50+/-10 RPM",
} as const;

export type CorpusFile = {
  filename: string;
  bytes: Buffer;
};

/**
 * Search excerpts are 900 characters. Page 2 starts with this many header
 * lines so a prefix truncation cannot reach the required-equipment row.
 */
export const REQUIRED_EQUIPMENT_HEADER_LINES = 20;

function drawLines(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  lines: string[],
  startY = 740
): void {
  let y = startY;
  for (const line of lines) {
    page.drawText(line, { x: 48, y, size: 11, font });
    y -= 14;
  }
}

function uutHeaderLine(index: number): string {
  return `UUT HEADER TOP-EVAL-01 Cirtronics Serial pending Straight Handpiece lot ${index + 1} repeating boilerplate for search excerpt truncation`;
}

export async function buildProtocolEquipmentPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const header = doc.addPage([612, 792]);
  drawLines(header, font, [
    "The equipment. A system. This report.",
    "Cover sheet — equipment. Separate system. Separate report.",
    ...Array.from({ length: 36 }, (_, index) => uutHeaderLine(index)),
  ]);

  const required = doc.addPage([612, 792]);
  drawLines(required, font, [
    ...Array.from({ length: REQUIRED_EQUIPMENT_HEADER_LINES }, (_, index) =>
      uutHeaderLine(index)
    ),
    "Equipment system report — required instruments",
    CORPUS_ANCHORS.requiredTable,
    "Instrument / Vendor / Calibration",
    `${CORPUS_ANCHORS.spectrumAnalyzer} / ${CORPUS_ANCHORS.narda} / N/A`,
    "Oscilloscope / Rigol MSO1104 / Yes",
    "Torque Wrench / CDI / Yes",
  ]);

  const executed = doc.addPage([612, 792]);
  drawLines(executed, font, [
    CORPUS_ANCHORS.executedLog,
    "Instrument / Vendor / Used",
    `${CORPUS_ANCHORS.torqueWrench} / ${CORPUS_ANCHORS.sturtevant} / Yes`,
    `${CORPUS_ANCHORS.digitalCalipers} / Mitutoyo / Yes`,
    "Timer / GraLab / Yes",
    "Force Gauge / Mark-10 / Yes",
    "This executed run log does not include a spectrum analyzer.",
    "The protocol required-equipment list is a different table on a different page.",
  ]);

  return Buffer.from(await doc.save());
}

export async function buildSoftwareRequirementsPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const cover = doc.addPage([612, 792]);
  drawLines(cover, font, [
    "Software Requirements Specification",
    "Eval corpus document — not a customer record",
    "This cover page has no requirement identifiers.",
    "The equipment. A system. This report. Cover only — not a data table.",
    "Revision A. Product: retrieval eval corpus. Controlled copy for search tests only.",
    "Do not cite this cover as containing SW-EVAL-7 or any equipment table.",
  ]);

  const table = doc.addPage([612, 792]);
  drawLines(table, font, [
    "TABLE SOFTWARE REQUIREMENTS",
    "ID / Description / Result",
    `${CORPUS_ANCHORS.swEval7} ${CORPUS_ANCHORS.interlock} Pass`,
    `${CORPUS_ANCHORS.pmcPr014} Preventive maintenance procedure Pass`,
    `${CORPUS_ANCHORS.sopDpQa014} Validation Qualification Procedure Pass`,
    "SW-EVAL-8 Waveform buffer depth Pass",
    "SW-EVAL-9 Footswitch debounce Pass",
    "SW-EVAL-10 Display brightness ramp Pass",
    "SW-EVAL-11 Emergency stop latch Pass",
    "SW-EVAL-12 Cooling fan watchdog Pass",
  ]);

  const urs = doc.addPage([612, 792]);
  const ursLines = [
    "User Requirement Specification — temperature operating range",
    ...Array.from(
      { length: 12 },
      (_, index) =>
        `URS table boilerplate line ${index + 1} of verification evidence for born-digital extract`
    ),
    `${CORPUS_ANCHORS.urs3} Shell Operating temperature`,
  ];
  drawLines(urs, font, ursLines);
  const rangeY = 740 - ursLines.length * 14;
  // Printed minus is a stroke, not a text glyph — the parser sees unsigned 15 °C.
  urs.drawLine({
    start: { x: 48, y: rangeY + 5 },
    end: { x: 66, y: rangeY + 5 },
    thickness: 3,
    color: rgb(0, 0, 0),
  });
  urs.drawText(CORPUS_ANCHORS.unsignedShellRange, {
    x: 72,
    y: rangeY,
    size: 14,
    font,
  });
  urs.drawText(CORPUS_ANCHORS.approxRpm, {
    x: 48,
    y: rangeY - 22,
    size: 11,
    font,
  });

  return Buffer.from(await doc.save());
}

export async function buildRetrievalCorpus(): Promise<CorpusFile[]> {
  const [protocol, software] = await Promise.all([
    buildProtocolEquipmentPdf(),
    buildSoftwareRequirementsPdf(),
  ]);
  return [
    { filename: PROTOCOL_EQUIPMENT_FILENAME, bytes: protocol },
    { filename: SOFTWARE_REQUIREMENTS_FILENAME, bytes: software },
  ];
}

export async function assertCorpusAnchors(
  files: readonly CorpusFile[]
): Promise<void> {
  const byName = new Map(files.map((file) => [file.filename, file]));
  const protocol = byName.get(PROTOCOL_EQUIPMENT_FILENAME);
  const software = byName.get(SOFTWARE_REQUIREMENTS_FILENAME);
  if (!protocol || !software) {
    throw new Error(
      `Corpus must include ${PROTOCOL_EQUIPMENT_FILENAME} and ${SOFTWARE_REQUIREMENTS_FILENAME}`
    );
  }

  const protocolLayer = await readPdfTextLayer(protocol.bytes);
  const softwareLayer = await readPdfTextLayer(software.bytes);
  const requiredPage = pageText(
    protocolLayer.pages,
    PROTOCOL_PAGES.requiredEquipment
  );
  const executedPage = pageText(protocolLayer.pages, PROTOCOL_PAGES.executedLog);
  const requirementsPage = pageText(
    softwareLayer.pages,
    SOFTWARE_PAGES.requirements
  );
  const ursShellPage = pageText(softwareLayer.pages, SOFTWARE_PAGES.ursShell);

  assertContains(requiredPage, CORPUS_ANCHORS.requiredTable, "protocol p.2");
  assertContains(requiredPage, CORPUS_ANCHORS.spectrumAnalyzer, "protocol p.2");
  assertContains(requiredPage, CORPUS_ANCHORS.narda, "protocol p.2");
  assertContains(executedPage, CORPUS_ANCHORS.executedLog, "protocol p.3");
  assertContains(executedPage, CORPUS_ANCHORS.torqueWrench, "protocol p.3");
  assertContains(executedPage, CORPUS_ANCHORS.digitalCalipers, "protocol p.3");
  assertAbsent(executedPage, CORPUS_ANCHORS.narda, "protocol p.3");
  assertContains(requirementsPage, CORPUS_ANCHORS.swEval7, "software p.2");
  assertContains(requirementsPage, CORPUS_ANCHORS.interlock, "software p.2");
  assertContains(requirementsPage, CORPUS_ANCHORS.pmcPr014, "software p.2");
  assertContains(requirementsPage, CORPUS_ANCHORS.sopDpQa014, "software p.2");
  assertContains(ursShellPage, CORPUS_ANCHORS.urs3, "software p.3");
  assertContains(
    ursShellPage,
    CORPUS_ANCHORS.unsignedShellRange,
    "software p.3"
  );
  assertContains(ursShellPage, CORPUS_ANCHORS.approxRpm, "software p.3");
  assertAbsent(ursShellPage, "-15", "software p.3");
  const protocolCover = pageText(protocolLayer.pages, PROTOCOL_PAGES.header);
  assertAbsent(protocolCover, CORPUS_ANCHORS.pmcPr014, "protocol p.1");
  assertAbsent(protocolCover, CORPUS_ANCHORS.requiredTable, "protocol p.1");
  for (const page of [...protocolLayer.pages, ...softwareLayer.pages]) {
    if (page.text.length < MIN_TEXT_LAYER_CHARS) {
      throw new Error(
        `page ${page.pageNumber} is too short for a born-digital text layer (${page.text.length} chars)`
      );
    }
  }
}

function pageText(
  pages: ReadonlyArray<{ pageNumber: number; text: string }>,
  pageNumber: number
): string {
  const page = pages.find((entry) => entry.pageNumber === pageNumber);
  if (!page) {
    throw new Error(`Corpus PDF is missing page ${pageNumber}`);
  }
  return page.text.replace(/\s+/g, " ");
}

function assertContains(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${label} is missing ${JSON.stringify(needle)}`);
  }
}

function assertAbsent(haystack: string, needle: string, label: string): void {
  if (haystack.includes(needle)) {
    throw new Error(`${label} must not contain ${JSON.stringify(needle)}`);
  }
}
