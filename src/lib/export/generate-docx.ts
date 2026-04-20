import fs from "node:fs";
import path from "node:path";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  AlignmentType,
  HeadingLevel,
  WidthType,
  BorderStyle,
  PageNumber,
  Header,
  Footer,
  ImageRun,
  ShadingType,
  Tab,
  convertMillimetersToTwip,
} from "docx";
import type {
  AnalyzeSection,
  ControlSection,
  DefineSection,
  ImproveSection,
  MeasureSection,
  SectionContentMap,
} from "@/types/sections";
import { EMPTY_CONTENT } from "@/types/sections";
import type { ReportSectionRecord } from "@/types/report";
import type { reports as reportsTable } from "@/db/schema";
import { getUser } from "@/lib/auth/mock-users";
import { formatDate } from "@/lib/utils";

type ReportRow = typeof reportsTable.$inferSelect;

const NAVY = "2D2A6E";
const BLACK = "111111";
const LIGHT_GREY = "F2F2F2";
const BORDER_GREY = "BFBFBF";

const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
  left: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
  right: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
};

function para(
  text: string,
  opts: {
    bold?: boolean;
    size?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    color?: string;
    italic?: boolean;
    spacingBefore?: number;
    spacingAfter?: number;
  } = {}
) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { before: opts.spacingBefore ?? 0, after: opts.spacingAfter ?? 60 },
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        italics: opts.italic,
        size: opts.size ?? 20,
        color: opts.color,
      }),
    ],
  });
}

function multilinePara(text: string, size = 20): Paragraph[] {
  if (!text || !text.trim()) {
    return [
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: "—",
            color: "999999",
            italics: true,
            size,
          }),
        ],
      }),
    ];
  }
  return text.split(/\r?\n/).map(
    (line) =>
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: line, size })],
      })
  );
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        color: NAVY,
        size: 26,
      }),
    ],
  });
}

function subheading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 22,
        color: NAVY,
      }),
    ],
  });
}

function labelValueRow(
  label: string,
  value: string | Paragraph[],
  opts: { labelWidth?: number } = {}
): TableRow {
  const labelWidth = opts.labelWidth ?? 30;
  return new TableRow({
    children: [
      new TableCell({
        width: { size: labelWidth, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: LIGHT_GREY },
        borders: CELL_BORDERS,
        children: [
          para(label, { bold: true, size: 20 }),
        ],
      }),
      new TableCell({
        width: { size: 100 - labelWidth, type: WidthType.PERCENTAGE },
        borders: CELL_BORDERS,
        children: Array.isArray(value) ? value : multilinePara(value ?? ""),
      }),
    ],
  });
}

function sectionByKey<K extends keyof SectionContentMap>(
  rows: ReportSectionRecord[],
  key: K
): SectionContentMap[K] {
  const row = rows.find((r) => r.section === key);
  if (!row) return EMPTY_CONTENT[key];
  return { ...(EMPTY_CONTENT[key] as object), ...(row.content as object) } as SectionContentMap[K];
}

function toolsRow(
  toolsUsed: { sixM: boolean; fiveWhy: boolean; brainstorming: boolean },
  otherTools: string
): Paragraph[] {
  const mk = (checked: boolean, label: string) =>
    `${checked ? "☑" : "☐"}  ${label}`;
  return [
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: mk(toolsUsed.sixM, "6M"), size: 20 }),
        new TextRun({ text: "     " }),
        new TextRun({ text: mk(toolsUsed.fiveWhy, "5 Why"), size: 20 }),
        new TextRun({ text: "     " }),
        new TextRun({
          text: mk(toolsUsed.brainstorming, "Brainstorming"),
          size: 20,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "Other Tools (If any): ",
          italics: true,
          size: 20,
        }),
        new TextRun({
          text: otherTools?.trim() || "Not applicable",
          size: 20,
        }),
      ],
    }),
  ];
}

function renderDefine(d: DefineSection): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(sectionHeading("Define"));
  out.push(
    para(
      "Following checks shall be considered while writing the 'Define' section.",
      { italic: true, color: "555555", size: 18 }
    )
  );
  const checks = [
    "Clearly define what happens actually.",
    "Explain what is different than expected.",
    "Mention the location where the deviation has occurred.",
    "Date/time of deviation occurrence and date/time of detection.",
    "Mention the name of personnel who is involved in the deviation.",
    "Mention initial scope of deviation (impacted product/Material/Equipment/System/Batches/etc.).",
  ];
  out.push(...checks.map((c) => bullet(c)));
  out.push(subheading("Details Investigation:"));
  out.push(...multilinePara(d.narrative));
  if (d.location) {
    out.push(subheading("Location:"));
    out.push(...multilinePara(d.location));
  }
  if (d.dateTimeOccurrence || d.dateTimeDetection) {
    out.push(subheading("Date / Time:"));
    if (d.dateTimeOccurrence)
      out.push(...multilinePara(`Occurrence: ${d.dateTimeOccurrence}`));
    if (d.dateTimeDetection)
      out.push(...multilinePara(`Detection: ${d.dateTimeDetection}`));
  }
  if (d.personnel) {
    out.push(subheading("Personnel involved:"));
    out.push(...multilinePara(d.personnel));
  }
  if (d.initialScope) {
    out.push(subheading("Initial scope:"));
    out.push(...multilinePara(d.initialScope));
  }
  return out;
}

function renderMeasure(m: MeasureSection): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(sectionHeading("Measure"));
  out.push(
    para(
      "Following checks shall be considered while writing the 'Measure' section.",
      { italic: true, color: "555555", size: 18 }
    )
  );
  const checks = [
    "Does the summary provide relevant facts and data/information reviewed (environment, process/product history, personnel info, controls limits)?",
    "Is a summary of the analysis of the factors and data provided?",
    "Is a conclusion statement of the analysis and review provided?",
    "If there were regulatory notifications, were details provided?",
    "Is the report written in a logical flow and easily understood by the reader?",
  ];
  out.push(...checks.map((c) => bullet(c)));
  out.push(...multilinePara(m.narrative));
  if (m.regulatoryNotification) {
    out.push(subheading("Regulatory Notification:"));
    out.push(...multilinePara(m.regulatoryNotification));
  }
  return out;
}

function renderAnalyze(a: AnalyzeSection): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(sectionHeading("Analyze"));
  out.push(
    para(
      "Various investigation tools used to analyze the root cause like 6M, 5 Why, Personnel interview, Brainstorming etc.",
      { italic: true, color: "555555", size: 18 }
    )
  );

  out.push(subheading("6M Method (If Applicable):"));
  const sixMPairs: Array<[string, string]> = [
    ["Man", a.sixM.man],
    ["Machine", a.sixM.machine],
    ["Measurement", a.sixM.measurement],
    ["Material", a.sixM.material],
    ["Method", a.sixM.method],
    ["Milieu (Environment)", a.sixM.milieu],
  ];
  for (const [label, value] of sixMPairs) {
    out.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `${label}: `, bold: true, size: 20 }),
          new TextRun({ text: value || "Not Applicable", size: 20 }),
        ],
      })
    );
  }
  out.push(
    new Paragraph({
      spacing: { before: 80, after: 60 },
      children: [
        new TextRun({ text: "Conclusion: ", bold: true, size: 20 }),
        new TextRun({ text: a.sixM.conclusion || "Not Applicable", size: 20 }),
      ],
    })
  );
  out.push(
    para(
      "Note: No 6M question shall be deleted in the investigation; if any question is not applicable, then mention in ans. as 'Not Applicable'.",
      { italic: true, color: "777777", size: 16 }
    )
  );

  out.push(subheading("5 Why Approach (If Applicable):"));
  a.fiveWhy.whys.forEach((why, i) => {
    out.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: `${i + 1}. Why: `,
            bold: true,
            size: 20,
          }),
          new TextRun({
            text: why.question || "Not Applicable",
            size: 20,
          }),
        ],
      })
    );
    out.push(
      new Paragraph({
        spacing: { after: 80 },
        indent: { left: convertMillimetersToTwip(5) },
        children: [
          new TextRun({ text: "Ans. ", bold: true, size: 20 }),
          new TextRun({ text: why.answer || "Not Applicable", size: 20 }),
        ],
      })
    );
  });
  out.push(
    new Paragraph({
      spacing: { before: 80, after: 60 },
      children: [
        new TextRun({ text: "Conclusion: ", bold: true, size: 20 }),
        new TextRun({
          text: a.fiveWhy.conclusion || "Not Applicable",
          size: 20,
        }),
      ],
    })
  );

  out.push(subheading("Brainstorming:"));
  out.push(...multilinePara(a.brainstorming || "Not Applicable"));
  out.push(subheading("Other Tool if Any:"));
  out.push(...multilinePara(a.otherTools || "Not Applicable"));

  out.push(subheading("Investigation Outcome:"));
  out.push(...multilinePara(a.investigationOutcome));

  out.push(subheading("Identified Root Cause / Probable Cause:"));
  if (a.rootCause.narrative) out.push(...multilinePara(a.rootCause.narrative));
  out.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: "Primary Root Cause Level 1: ", bold: true, size: 20 }),
        new TextRun({
          text: a.rootCause.primaryLevel1 || "Not Applicable",
          size: 20,
        }),
      ],
    })
  );
  out.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: "Secondary Root Cause Level 2: ", bold: true, size: 20 }),
        new TextRun({
          text: a.rootCause.secondaryLevel2 || "Not Applicable",
          size: 20,
        }),
      ],
    })
  );
  out.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: "Third Root Cause Level 3: ", bold: true, size: 20 }),
        new TextRun({
          text: a.rootCause.thirdLevel3 || "Not Applicable",
          size: 20,
        }),
      ],
    })
  );

  out.push(
    subheading(
      "Impact Assessment (System / Document / Product / Equipment / Patient Safety / Past Batches):"
    )
  );
  const impactPairs: Array<[string, string]> = [
    ["System", a.impactAssessment.system],
    ["Document", a.impactAssessment.document],
    ["Product", a.impactAssessment.product],
    ["Equipment", a.impactAssessment.equipment],
    ["Patient safety / Past Batches", a.impactAssessment.patientSafety],
  ];
  for (const [label, value] of impactPairs) {
    out.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: `${label}: `, bold: true, size: 20 }),
          new TextRun({
            text: value || "Not Applicable",
            size: 20,
          }),
        ],
      })
    );
  }
  return out;
}

function renderImprove(i: ImproveSection): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(sectionHeading("Improve"));
  out.push(
    para("Improve section covers the corrective actions.", {
      italic: true,
      color: "555555",
      size: 18,
    })
  );
  const checks = [
    "Were specific corrective actions identified (including immediate actions)?",
    "Were specific corrective actions identified for each root cause?",
    "Was the corrective action assigned a unique number, responsible person and due date?",
    "Does the action describe the expected outcome that can be verified?",
    "Was effectiveness verification required or not, with rationale documented?",
    "Are the identified corrective actions achievable?",
  ];
  out.push(...checks.map((c) => bullet(c)));

  out.push(subheading("Corrective Action:"));
  out.push(...multilinePara(i.narrative));

  if (i.correctiveActions.length > 0) {
    out.push(subheading("Corrective Actions Register:"));
  }
  i.correctiveActions.forEach((a, idx) => {
    const num = `CA-${String(idx + 1).padStart(3, "0")}`;
    out.push(
      new Paragraph({
        spacing: { before: 120, after: 40 },
        children: [
          new TextRun({
            text: `${num}: `,
            bold: true,
            size: 20,
            color: NAVY,
          }),
          new TextRun({ text: a.description || "—", size: 20 }),
        ],
      })
    );
    const bullets: string[] = [];
    if (a.responsiblePerson) bullets.push(`Responsible person: ${a.responsiblePerson}`);
    if (a.dueDate) bullets.push(`Due date: ${a.dueDate}`);
    if (a.expectedOutcome) bullets.push(`Expected outcome: ${a.expectedOutcome}`);
    if (a.effectivenessVerification)
      bullets.push(`Effectiveness verification: ${a.effectivenessVerification}`);
    for (const b of bullets) out.push(bullet(b));
  });
  return out;
}

function renderControl(c: ControlSection): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(sectionHeading("Control"));
  out.push(
    para("Control section covers the preventive actions.", {
      italic: true,
      color: "555555",
      size: 18,
    })
  );

  out.push(subheading("Preventive Action:"));
  out.push(...multilinePara(c.narrative));

  if (c.preventiveActions.length > 0) {
    out.push(subheading("Preventive Actions Register:"));
  }
  c.preventiveActions.forEach((a, idx) => {
    const num = `PA-${String(idx + 1).padStart(3, "0")}`;
    out.push(
      new Paragraph({
        spacing: { before: 120, after: 40 },
        children: [
          new TextRun({
            text: `${num}: `,
            bold: true,
            size: 20,
            color: NAVY,
          }),
          new TextRun({ text: a.description || "—", size: 20 }),
        ],
      })
    );
    const bullets: string[] = [];
    if (a.linkedRootCause) bullets.push(`Linked root cause: ${a.linkedRootCause}`);
    if (a.responsiblePerson) bullets.push(`Responsible person: ${a.responsiblePerson}`);
    if (a.dueDate) bullets.push(`Due date: ${a.dueDate}`);
    if (a.expectedOutcome) bullets.push(`Expected outcome: ${a.expectedOutcome}`);
    if (a.effectivenessVerification)
      bullets.push(`Effectiveness verification: ${a.effectivenessVerification}`);
    for (const b of bullets) out.push(bullet(b));
  });

  out.push(subheading("Interim Plan:"));
  out.push(...multilinePara(c.interimPlan));
  out.push(subheading("Final Comments:"));
  out.push(...multilinePara(c.finalComments));

  out.push(subheading("Impact Assessment (post-investigation):"));
  const fields: Array<[string, string]> = [
    ["Regulatory Impact / Notification", c.regulatoryImpact],
    ["Product Quality", c.productQuality],
    ["Validation", c.validation],
    ["Stability", c.stability],
    ["Market / Clinical", c.marketClinical],
    ["Lot Disposition", c.lotDisposition],
  ];
  for (const [label, value] of fields) {
    out.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: `${label}: `, bold: true, size: 20 }),
          new TextRun({
            text: value || "Not Applicable",
            size: 20,
          }),
        ],
      })
    );
  }

  out.push(subheading("Conclusion:"));
  out.push(...multilinePara(c.conclusion));
  return out;
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    bullet: { level: 0 },
    children: [new TextRun({ text, size: 20 })],
  });
}

function buildTopTable(report: ReportRow): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
      left: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
      right: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
      insideHorizontal: {
        style: BorderStyle.SINGLE,
        size: 6,
        color: BORDER_GREY,
      },
      insideVertical: {
        style: BorderStyle.SINGLE,
        size: 6,
        color: BORDER_GREY,
      },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: LIGHT_GREY },
            borders: CELL_BORDERS,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Date: ", bold: true, size: 20 }),
                  new TextRun({
                    text: formatDate(report.date),
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: LIGHT_GREY },
            borders: CELL_BORDERS,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Deviation No.  ", bold: true, size: 20 }),
                  new TextRun({ text: report.deviationNo, size: 20 }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnSpan: 2,
            borders: CELL_BORDERS,
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({ text: "Investigation tool used: ", bold: true, size: 20 }),
                ],
              }),
              ...toolsRow(report.toolsUsed, report.otherTools),
            ],
          }),
        ],
      }),
    ],
  });
}

function buildSignatureTable(report: ReportRow): Table {
  const author = getUser(report.authorId);
  const manager = getUser(report.assignedManagerId ?? undefined);

  const mkCell = (label: string, name?: string) =>
    new TableCell({
      width: { size: 25, type: WidthType.PERCENTAGE },
      borders: CELL_BORDERS,
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [
            new TextRun({ text: label, bold: true, size: 18 }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 160, after: 60 },
          children: [new TextRun({ text: "__________________", size: 18 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [
            new TextRun({ text: name ?? " ", size: 18, italics: true }),
          ],
        }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
      left: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
      right: { style: BorderStyle.SINGLE, size: 6, color: BORDER_GREY },
      insideHorizontal: {
        style: BorderStyle.SINGLE,
        size: 6,
        color: BORDER_GREY,
      },
      insideVertical: {
        style: BorderStyle.SINGLE,
        size: 6,
        color: BORDER_GREY,
      },
    },
    rows: [
      new TableRow({
        children: [
          mkCell("Prepared By\n(Sign/Date)", author?.name),
          mkCell("Reviewed By\n(Sign/Date)", manager?.name),
          mkCell("Reviewed By (QA)\n(Sign/Date)"),
          mkCell("Approved By QA\n(Sign/Date)"),
        ],
      }),
    ],
  });
}

function loadLogo(): Buffer | null {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    return fs.readFileSync(logoPath);
  } catch {
    return null;
  }
}

function buildHeader(): Header {
  const logo = loadLogo();
  const cells: TableCell[] = [];
  if (logo) {
    cells.push(
      new TableCell({
        width: { size: 15, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: "auto" },
          bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
          left: { style: BorderStyle.NONE, size: 0, color: "auto" },
          right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        },
        children: [
          new Paragraph({
            children: [
              new ImageRun({
                data: logo,
                transformation: { width: 50, height: 50 },
                type: "png",
              }),
            ],
          }),
        ],
      })
    );
  }
  cells.push(
    new TableCell({
      width: { size: logo ? 70 : 85, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "M.J. Biopharm Private Limited",
              bold: true,
              size: 22,
              color: NAVY,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "Plot No. 18, International Biotech Park, Hinjawadi, Phase II, Pune 411057.",
              size: 16,
              color: BLACK,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "Investigation Report",
              bold: true,
              size: 20,
              color: NAVY,
            }),
          ],
        }),
      ],
    })
  );
  cells.push(
    new TableCell({
      width: { size: 15, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: "Ref. SOP No.:",
              size: 14,
              color: BLACK,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: "SOP/DP/QA/008",
              size: 14,
              bold: true,
              color: BLACK,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: "Unit: Drug Product",
              size: 14,
              color: BLACK,
            }),
          ],
        }),
      ],
    })
  );
  return new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: "auto" },
          bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY },
          left: { style: BorderStyle.NONE, size: 0, color: "auto" },
          right: { style: BorderStyle.NONE, size: 0, color: "auto" },
          insideHorizontal: {
            style: BorderStyle.NONE,
            size: 0,
            color: "auto",
          },
          insideVertical: {
            style: BorderStyle.NONE,
            size: 0,
            color: "auto",
          },
        },
        rows: [new TableRow({ children: cells })],
      }),
    ],
  });
}

function buildFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "Confidential and Proprietary",
            size: 16,
            italics: true,
            color: "666666",
          }),
          new TextRun({ children: [new Tab()], size: 16 }),
          new TextRun({ children: ["Page "], size: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16 }),
          new TextRun({ children: [" of "], size: 16 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16 }),
          new TextRun({ children: [new Tab()], size: 16 }),
          new TextRun({
            text: "SOP/DP/QA/008/F04-R02",
            size: 16,
            color: "666666",
          }),
        ],
      }),
    ],
  });
}

export async function generateReportDocx({
  report,
  sections,
}: {
  report: ReportRow;
  sections: ReportSectionRecord[];
}): Promise<Buffer> {
  const d = sectionByKey(sections, "define");
  const m = sectionByKey(sections, "measure");
  const a = sectionByKey(sections, "analyze");
  const i = sectionByKey(sections, "improve");
  const c = sectionByKey(sections, "control");

  const children: (Paragraph | Table)[] = [];
  children.push(buildTopTable(report));
  children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
  children.push(...renderDefine(d));
  children.push(...renderMeasure(m));
  children.push(...renderAnalyze(a));
  children.push(...renderImprove(i));
  children.push(...renderControl(c));

  children.push(
    new Paragraph({
      spacing: { before: 360, after: 60 },
      children: [
        new TextRun({
          text: "Document Reviewed: ",
          bold: true,
          size: 20,
        }),
      ],
    })
  );
  children.push(
    ...multilinePara(
      "SOP for operation and cleaning procedure for intermediate cold room."
    )
  );

  children.push(
    new Paragraph({
      spacing: { before: 360, after: 120 },
      children: [
        new TextRun({
          text: "List of attachment (If applicable):",
          bold: true,
          size: 20,
        }),
      ],
    })
  );
  [
    "Attachment No. I: Photo copy of Breakdown Form",
    "Attachment No. II: Preliminary Investigation",
    "Attachment No. IV: Training Documentation Form",
    "Attachment No. V: Service Provider Justification Report",
    "Attachment No. VI: Root Cause Categorization",
  ].forEach((line) => children.push(bullet(line)));

  children.push(
    new Paragraph({
      spacing: { before: 360, after: 120 },
      children: [],
    })
  );
  children.push(buildSignatureTable(report));

  const doc = new Document({
    creator: "MJ Biopharm Investigation Report",
    title: `Investigation Report ${report.deviationNo}`,
    styles: {
      default: {
        document: {
          run: { size: 20, font: "Calibri" },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(30),
              bottom: convertMillimetersToTwip(25),
              left: convertMillimetersToTwip(20),
              right: convertMillimetersToTwip(20),
            },
          },
        },
        headers: { default: buildHeader() },
        footers: { default: buildFooter() },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
