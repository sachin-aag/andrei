import { VQ_FORM, vqFieldCaption, type VqField, type VqFieldKind } from "./schema";
import { fieldRefId, type VqAnswers } from "./sections";

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rPr(opts: { bold?: boolean; sz?: number } = {}): string {
  const sz = opts.sz ?? 18;
  return `<w:rPr>${opts.bold ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
}

function textRun(text: string, opts: { bold?: boolean; sz?: number } = {}): string {
  return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function para(runs: string, extraPPr = ""): string {
  return `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/>${extraPPr}</w:pPr>${runs}</w:p>`;
}

const BORDER = (side: string) =>
  `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;
const TBL_BORDERS = `<w:tblBorders>${BORDER("top")}${BORDER("left")}${BORDER("bottom")}${BORDER("right")}${BORDER("insideH")}${BORDER("insideV")}</w:tblBorders>`;

function cell(width: number, inner: string, fill?: string): string {
  const fillXml = fill
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`
    : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fillXml}<w:vAlign w:val="center"/></w:tcPr>${inner}</w:tc>`;
}

function displayAnswer(kind: VqFieldKind, raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (kind === "yes_no" || kind === "yes_no_na" || kind === "yes_no_na_ref") {
    switch (value) {
      case "yes":
        return "Yes";
      case "no":
        return "No";
      case "na":
        return "N.A.";
      default:
        return value;
    }
  }
  return value;
}

function answerColumnLabel(kind: VqFieldKind): string {
  switch (kind) {
    case "yes_no":
      return "Yes / No";
    case "yes_no_na":
    case "yes_no_na_ref":
      return "Yes / No / N.A.";
    case "textarea":
    case "text":
      return "Response";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function questionnaireXml(
  sectionKey: string,
  answers: VqAnswers
): string {
  const spec = VQ_FORM[sectionKey];
  if (!spec) return "";
  const parts: string[] = [];
  if (spec.instruction) {
    parts.push(para(textRun(spec.instruction, { sz: 18 })));
  }
  for (const group of spec.groups) {
    if (group.title) {
      parts.push(para(textRun(group.title, { bold: true, sz: 20 })));
    }
    if (group.note) {
      parts.push(para(textRun(group.note, { sz: 16 })));
    }
    if (group.fields.length === 0) continue;
    parts.push(fieldsTable(group.fields, answers));
  }
  return parts.join("");
}

function fieldsTable(fields: VqField[], answers: VqAnswers): string {
  const needsRef = fields.some((field) => field.kind === "yes_no_na_ref");
  const colNo = 900;
  const colAns = 1600;
  const colRef = needsRef ? 1400 : 0;
  const colQ = 10400 - colNo - colAns - colRef;
  const widths = needsRef
    ? [colNo, colQ, colAns, colRef]
    : [colNo, colQ, colAns];
  const header = `<w:tr>${
    cell(colNo, para(textRun("No.", { bold: true, sz: 16 })), "D9D9D9") +
    cell(colQ, para(textRun("Question", { bold: true, sz: 16 })), "D9D9D9") +
    cell(
      colAns,
      para(textRun(answerColumnLabel(fields[0]!.kind), { bold: true, sz: 16 })),
      "D9D9D9"
    ) +
    (needsRef
      ? cell(colRef, para(textRun("Ref", { bold: true, sz: 16 })), "D9D9D9")
      : "")
  }</w:tr>`;
  const rows = fields
    .map((field) => {
      const answer = displayAnswer(field.kind, answers[field.id]);
      const ref =
        field.kind === "yes_no_na_ref"
          ? (answers[fieldRefId(field.id)] ?? "")
          : "";
      return `<w:tr>${
        cell(colNo, para(textRun(field.number ?? "", { sz: 16 }))) +
        cell(
          colQ,
          para(
            textRun(vqFieldCaption(field), { sz: 16 })
          )
        ) +
        cell(colAns, para(textRun(answer, { sz: 16 }))) +
        (needsRef ? cell(colRef, para(textRun(ref, { sz: 16 }))) : "")
      }</w:tr>`;
    })
    .join("");
  const total = widths.reduce((sum, width) => sum + width, 0);
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${TBL_BORDERS}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${header}${rows}</w:tbl>`;
}

export function vqTemplateKey(sectionKey: string): {
  fields: string;
  narrative: string;
  table: string;
} {
  const camel = sectionKey.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase()
  );
  return {
    fields: `${camel}Xml`,
    narrative: `${camel}NarrativeXml`,
    table: `${camel}TableXml`,
  };
}
