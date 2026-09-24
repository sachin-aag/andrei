/**
 * Word XML for the 3xper vendor qualification form (QAD-SOP-MS-001-F04).
 *
 * Reproduces the paper layout: one bordered table per section, grey banner
 * rows, inline `Yes ☐ No ☐ N/A ☐` cells, `Ref:` cells, merged number cells
 * for continuation rows, and the per-page signature table in the footer.
 * Row geometry comes from `schema.ts`; widths are in dxa (1/20 pt).
 */
import type { JSONContent } from "@tiptap/core";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import {
  VQ_COMPLETION_STATEMENTS,
  VQ_FORM,
  VQ_FORM_NO,
  VQ_PAGE_SIGNATURE_HEADERS,
  VQ_REQUIRED_SECTION_LETTERS,
  VQ_REQUIRED_SECTION_TITLES,
  VQ_SCORING_GUIDANCE,
  VQ_SCORING_OUTCOMES,
  VQ_VENDOR_PROCEDURE,
  vqGridCellId,
  type VqField,
  type VqFormSection,
  type VqGroup,
  type VqMatrixSpec,
} from "./schema";
import {
  VQ_SECTION_KEYS,
  fieldRefId,
  parseVqPageSignatures,
  type VqAnswers,
  type VqPageSignatureRow,
  type VqSectionContent,
  type VqSectionKey,
} from "./sections";

/** Page 11909 less 720 margins either side. */
export const VQ_TABLE_WIDTH = 10440;
const NO_W = 900;
const CHOICE_W = 860;
const WIDE_CHOICE_W = 2000;
const REF_W = 2000;
const CHOICE_AREA = CHOICE_W * 3;
const REF_AREA = CHOICE_AREA + REF_W;
/** Answer column for free-text rows outside Reference-column groups. */
const textAnswerWidth = 4800;

const SECTION_FILL = "A6A6A6";
const BANNER_FILL = "BFBFBF";
/** Filled-in answers print in dark blue, like the ink on the paper original. */
const ANSWER_COLOR = "1F3864";
const FONT = "Times New Roman";
const BODY_SZ = 22;
const SMALL_SZ = 20;

const UNCHECKED = "☐";
const CHECKED = "☑";

// ---------------------------------------------------------------------------
// XML primitives

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type RunStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  sz?: number;
  color?: string;
  font?: string;
};

function rPr(style: RunStyle = {}): string {
  const font = style.font ?? FONT;
  const sz = style.sz ?? BODY_SZ;
  return (
    "<w:rPr>" +
    `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>` +
    (style.bold ? "<w:b/><w:bCs/>" : "") +
    (style.italic ? "<w:i/><w:iCs/>" : "") +
    (style.strike ? "<w:strike/>" : "") +
    (style.color ? `<w:color w:val="${style.color}"/>` : "") +
    `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` +
    (style.underline ? '<w:u w:val="single"/>' : "") +
    "</w:rPr>"
  );
}

/** Text run; `\n` becomes a line break inside the same paragraph. */
function run(text: string, style: RunStyle = {}): string {
  if (!text) return "";
  return text
    .split("\n")
    .map(
      (line, i) =>
        `<w:r>${rPr(style)}${i > 0 ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`
    )
    .join("");
}

function box(checked: boolean, sz = BODY_SZ): string {
  return run(checked ? CHECKED : UNCHECKED, { font: "MS Gothic", sz });
}

type ParaOpts = {
  jc?: "left" | "center" | "right" | "both";
  indent?: number;
  hanging?: number;
  before?: number;
  after?: number;
  keepNext?: boolean;
  outline?: number;
};

function p(runs: string, opts: ParaOpts = {}): string {
  const spacing = `<w:spacing w:before="${opts.before ?? 40}" w:after="${opts.after ?? 40}" w:line="240" w:lineRule="auto"/>`;
  const ind =
    opts.indent || opts.hanging
      ? `<w:ind w:left="${opts.indent ?? 0}"${opts.hanging ? ` w:hanging="${opts.hanging}"` : ""}/>`
      : "";
  return (
    "<w:p><w:pPr>" +
    (opts.keepNext ? "<w:keepNext/>" : "") +
    spacing +
    ind +
    (opts.jc ? `<w:jc w:val="${opts.jc}"/>` : "") +
    (opts.outline !== undefined ? `<w:outlineLvl w:val="${opts.outline}"/>` : "") +
    "</w:pPr>" +
    runs +
    "</w:p>"
  );
}

function spacer(after = 120): string {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="${after}"/><w:rPr><w:sz w:val="12"/></w:rPr></w:pPr></w:p>`;
}

function pageBreak(): string {
  return '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>';
}

// ---------------------------------------------------------------------------
// Table builder with an auto-computed grid

type Cell = {
  w: number;
  body: string;
  fill?: string;
  vMerge?: "restart" | "continue";
  vAlign?: "top" | "center";
};

type Row = {
  cells: Cell[];
  minHeight?: number;
  /** Banner / header rows: never left alone at the bottom of a page. */
  keepNext?: boolean;
};

/** Default row height: the paper form leaves ~9 mm per answer line. */
const ROW_MIN = 500;

function cell(w: number, body: string, extra: Omit<Cell, "w" | "body"> = {}): Cell {
  return { w, body: body || p(""), ...extra };
}

/**
 * Word needs a `tblGrid` whose columns every cell spans exactly. Rows here use
 * whatever widths their layout needs, so the grid is the union of every row's
 * cell boundaries and each cell gets the matching `gridSpan`.
 */
function table(
  rows: Row[],
  { width = VQ_TABLE_WIDTH, rowMin = ROW_MIN }: { width?: number; rowMin?: number } = {}
): string {
  const normalized = rows.map((row) => {
    const total = row.cells.reduce((sum, c) => sum + c.w, 0);
    if (total === width || row.cells.length === 0) return row;
    const cells = row.cells.map((c) => ({ ...c }));
    cells[cells.length - 1]!.w += width - total;
    return { ...row, cells };
  });
  const bounds = new Set<number>([0, width]);
  for (const row of normalized) {
    let x = 0;
    for (const c of row.cells) {
      x += c.w;
      bounds.add(x);
    }
  }
  const sorted = [...bounds].sort((a, b) => a - b);
  const grid = sorted
    .slice(1)
    .map((b, i) => `<w:gridCol w:w="${b - sorted[i]!}"/>`)
    .join("");
  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;
  const tblPr =
    `<w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:jc w:val="center"/>` +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders>` +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>' +
    "</w:tblPr>";
  const rowXml = normalized
    .map((row) => {
      let x = 0;
      const cells = row.cells
        .map((c) => {
          const start = x;
          x += c.w;
          const span = sorted.filter((b) => b > start && b <= x).length;
          return (
            "<w:tc><w:tcPr>" +
            `<w:tcW w:w="${c.w}" w:type="dxa"/>` +
            (span > 1 ? `<w:gridSpan w:val="${span}"/>` : "") +
            (c.vMerge ? `<w:vMerge w:val="${c.vMerge}"/>` : "") +
            (c.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.fill}"/>` : "") +
            `<w:vAlign w:val="${c.vAlign ?? "center"}"/>` +
            "</w:tcPr>" +
            (c.vMerge === "continue" ? p("") : c.body) +
            "</w:tc>"
          );
        })
        .join("");
      const minHeight = row.minHeight ?? rowMin;
      const height = minHeight
        ? `<w:trHeight w:val="${minHeight}" w:hRule="atLeast"/>`
        : "";
      const body = row.keepNext
        ? cells.replaceAll("<w:pPr>", "<w:pPr><w:keepNext/>")
        : cells;
      return `<w:tr><w:trPr><w:cantSplit/>${height}</w:trPr>${body}</w:tr>`;
    })
    .join("");
  return `<w:tbl>${tblPr}<w:tblGrid>${grid}</w:tblGrid>${rowXml}</w:tbl>`;
}

// ---------------------------------------------------------------------------
// Answer helpers

function answerOf(answers: VqAnswers, id: string): string {
  return (answers[id] ?? "").trim();
}

function ticked(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "yes" || v === "true" || v === "on" || v === "1";
}

/** Ref text for `ref` fields; older rows kept it under `${id}__ref`. */
function refText(answers: VqAnswers, field: VqField): string {
  return answerOf(answers, field.id) || answerOf(answers, fieldRefId(field.id));
}

function answerRun(value: string, style: RunStyle = {}): string {
  return run(value, { color: ANSWER_COLOR, ...style });
}

function labeled(labelText: string, value: string, style: RunStyle = {}): string {
  return run(labelText, style) + (value ? run(" ", style) + answerRun(value) : "");
}

function choiceCell(
  w: number,
  labelText: string,
  checked: boolean,
  fill?: string
): Cell {
  return cell(w, p(run(`${labelText} `) + box(checked), { jc: "left" }), { fill });
}

function questionText(field: VqField): string {
  return `${field.required ? "*" : ""}${field.label}`;
}

function questionPara(field: VqField, strong = false): string {
  const bullet = field.bullet ? "▪   " : "";
  const lines = questionText(field).split("\n");
  return lines
    .map((line, i) =>
      p(run(i === 0 ? `${bullet}${line}` : line, { bold: strong || field.strong }), {
        indent: field.bullet ? 300 : undefined,
        hanging: field.bullet && i === 0 ? 300 : undefined,
      })
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Questionnaire rows

type GroupLayout = {
  hasRefColumn: boolean;
  choiceW: number;
  naLabel: string;
};

function layoutFor(group: VqGroup): GroupLayout {
  const hasRefColumn =
    Boolean(group.answerHeader) ||
    group.fields.some(
      (field) =>
        field.kind === "yes_no_na_ref" ||
        field.kind === "ref_note" ||
        field.kind === "yes_ref_no_na" ||
        field.kind === "enclosed_ref_na"
    );
  return {
    hasRefColumn,
    choiceW: group.wideChoices ? WIDE_CHOICE_W : CHOICE_W,
    naLabel: group.naLabel ?? "N/A",
  };
}

function numberCell(field: VqField, next: VqField | undefined): Cell {
  if (field.cont) return cell(NO_W, "", { vMerge: "continue" });
  const restart = next?.cont ? ("restart" as const) : undefined;
  return cell(NO_W, p(run(field.number ?? "")), { vMerge: restart });
}

/** Answer cells for a field, left to right, after the question cell. */
function answerCells(
  field: VqField,
  answers: VqAnswers,
  layout: GroupLayout
): Cell[] {
  const value = answerOf(answers, field.id);
  const choice = value.toLowerCase();
  const area = layout.hasRefColumn ? REF_AREA : CHOICE_AREA;
  const trailingRef = () =>
    layout.hasRefColumn
      ? [
          cell(
            REF_W,
            field.trailing
              ? p(run(field.trailing, { bold: true }), { jc: "center" })
              : p("")
          ),
        ]
      : [];
  switch (field.kind) {
    case "yes_no": {
      const w = Math.round(CHOICE_AREA / 2);
      return [
        choiceCell(w, "Yes", choice === "yes"),
        choiceCell(CHOICE_AREA - w, "No", choice === "no"),
        ...trailingRef(),
      ];
    }
    case "yes_no_na":
      return [
        choiceCell(layout.choiceW, "Yes", choice === "yes"),
        choiceCell(layout.choiceW, "No", choice === "no"),
        choiceCell(layout.choiceW, layout.naLabel, choice === "na"),
        ...trailingRef(),
      ];
    case "yes_no_na_ref":
      return [
        choiceCell(CHOICE_W, "Yes", choice === "yes"),
        choiceCell(CHOICE_W, "No", choice === "no"),
        choiceCell(CHOICE_W, "N/A", choice === "na"),
        cell(REF_W, p(answerRun(answerOf(answers, fieldRefId(field.id))))),
      ];
    case "yes_ref_no_na":
      return [
        choiceCell(CHOICE_W, "Yes", choice === "yes"),
        cell(REF_W, p(labeled("Ref:", answerOf(answers, fieldRefId(field.id))))),
        choiceCell(CHOICE_W, "No", choice === "no"),
        choiceCell(CHOICE_W, "N/A", choice === "na"),
      ];
    case "enclosed_ref_na": {
      const side = Math.round((REF_AREA - REF_W) / 2);
      return [
        cell(side, p(run("Enclosed")) + p(box(choice === "yes"))),
        cell(REF_W, p(labeled("Ref:", answerOf(answers, fieldRefId(field.id))))),
        choiceCell(REF_AREA - REF_W - side, "N/A", choice === "na"),
      ];
    }
    case "ref":
      return [cell(area, p(labeled("Ref:", refText(answers, field))))];
    case "ref_note":
      return [
        cell(CHOICE_AREA, p(labeled("Ref:", refText(answers, field)))),
        cell(REF_W, p(answerRun(answerOf(answers, `${field.id}__note`)))),
      ];
    case "choice": {
      const options = field.options ?? [];
      const w = Math.round(CHOICE_AREA / Math.max(options.length, 1));
      return [
        ...options.map((option, i) =>
          cell(
            i === options.length - 1 ? CHOICE_AREA - w * (options.length - 1) : w,
            p(box(choice === option.value) + run(` ${option.label}`))
          )
        ),
        ...trailingRef(),
      ];
    }
    case "checks": {
      const checks = field.checks ?? [];
      if (field.vertical) {
        return [
          cell(
            area,
            checks
              .map((option) =>
                p(box(ticked(answers[option.id])) + run(` ${option.label}`))
              )
              .join("")
          ),
        ];
      }
      const w = Math.round(CHOICE_AREA / Math.max(checks.length, 1));
      return [
        ...checks.map((option, i) =>
          cell(
            i === checks.length - 1 ? CHOICE_AREA - w * (checks.length - 1) : w,
            p(box(ticked(answers[option.id])) + run(` ${option.label}`))
          )
        ),
        ...trailingRef(),
      ];
    }
    case "static":
      return [cell(area, p(run(field.value ?? "", { bold: true })))];
    case "text":
    case "textarea": {
      const body =
        (field.prefix ? run(`${field.prefix} `) : "") +
        answerRun(value) +
        (field.suffix ? run(`  ${field.suffix}`) : "");
      return [cell(layout.hasRefColumn ? REF_AREA : textAnswerWidth, p(body))];
    }
    case "check":
    case "label":
    case "grid":
      return [];
    default: {
      const exhaustive: never = field.kind;
      return exhaustive;
    }
  }
}


function fieldRows(
  field: VqField,
  next: VqField | undefined,
  answers: VqAnswers,
  layout: GroupLayout
): Row[] {
  const numbered = field.number !== undefined && field.number !== "";
  const hasNumberColumn = numbered || field.cont;
  const lead = hasNumberColumn ? [numberCell(field, next)] : [];
  const rest = VQ_TABLE_WIDTH - (hasNumberColumn ? NO_W : 0);

  if (field.kind === "label") {
    return [{ keepNext: true, cells: [...lead, cell(rest, questionPara(field))] }];
  }
  if (field.kind === "grid") {
    const columns = field.columns ?? [];
    const colW = Math.floor(rest / Math.max(columns.length, 1));
    const contCell = () => cell(NO_W, "", { vMerge: "continue" });
    const head: Row = {
      keepNext: true,
      cells: [
        ...(hasNumberColumn ? [contCell()] : []),
        ...columns.map((heading) =>
          cell(colW, p(run(heading, { bold: true }), { jc: "center" }))
        ),
      ],
    };
    const body: Row[] = Array.from({ length: field.rows ?? 0 }, (_, r) => ({
      minHeight: 400,
      cells: [
        ...(hasNumberColumn ? [contCell()] : []),
        ...columns.map((_, c) =>
          cell(colW, p(answerRun(answerOf(answers, vqGridCellId(field.id, r, c)))))
        ),
      ],
    }));
    return [head, ...body];
  }
  if (field.wide) {
    const value =
      field.kind === "ref" ? refText(answers, field) : answerOf(answers, field.id);
    const body =
      field.kind === "ref"
        ? questionPara(field) + p(labeled("Ref:", value))
        : p(labeled(questionText(field), value));
    return [{ cells: [...lead, cell(rest, body)], minHeight: 400 }];
  }
  if (field.lead) {
    const value = answerOf(answers, field.id).toLowerCase();
    const areaW = layout.hasRefColumn ? REF_AREA : textAnswerWidth;
    return [
      {
        cells: [
          cell(
            VQ_TABLE_WIDTH - areaW,
            p(
              run("Yes ") +
                box(value === "yes") +
                run("      No ") +
                box(value === "no")
            ),
            { fill: BANNER_FILL }
          ),
          cell(areaW, p(run(field.label))),
        ],
      },
    ];
  }
  if (field.refColumn) {
    return [
      {
        cells: [
          cell(VQ_TABLE_WIDTH - REF_W, p(run(field.label))),
          cell(REF_W, p(answerRun(answerOf(answers, field.id)), { jc: "center" })),
        ],
      },
    ];
  }
  if (field.kind === "check") {
    const labelW = 2600;
    return [
      {
        cells: [
          ...lead,
          cell(labelW, questionPara(field)),
          cell(
            rest - labelW,
            p(run(`${field.detail ?? ""} `) + box(ticked(answers[field.id])))
          ),
        ],
      },
    ];
  }
  const answer = answerCells(field, answers, layout);
  const answerW = answer.reduce((sum, c) => sum + c.w, 0);
  return [
    {
      cells: [...lead, cell(rest - answerW, questionPara(field)), ...answer],
    },
  ];
}

function bannerRows(group: VqGroup): Row[] {
  const rows: Row[] = [];
  const fill = group.plain ? undefined : BANNER_FILL;
  if (group.title) {
    const titleLines = group.title.split("\n");
    const titleBody = titleLines
      .map((line, i) => p(run(line, { bold: i === 0 || !group.number })))
      .join("");
    const header = group.answerHeader
      ? [cell(REF_W, p(run(group.answerHeader, { bold: true }), { jc: "center" }), { fill })]
      : [];
    const headerW = header.reduce((sum, c) => sum + c.w, 0);
    const numberW = group.number ? NO_W : 0;
    rows.push({
      keepNext: true,
      cells: [
        ...(group.number
          ? [cell(NO_W, p(run(group.number, { bold: true })), { fill })]
          : []),
        cell(VQ_TABLE_WIDTH - numberW - headerW, titleBody, { fill }),
        ...header,
      ],
    });
  }
  if (group.note) {
    rows.push({
      keepNext: true,
      cells: [
        cell(
          VQ_TABLE_WIDTH,
          group.note
            .split("\n")
            .map((line) => p(run(line, { bold: Boolean(group.noteShaded) })))
            .join(""),
          { fill: group.noteShaded ? BANNER_FILL : undefined }
        ),
      ],
    });
  }
  return rows;
}

function groupRows(group: VqGroup, answers: VqAnswers): Row[] {
  const layout = layoutFor(group);
  const rows = bannerRows(group);
  const fields = group.fields;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    if (field.joinPrevious) {
      const prev = rows[rows.length - 1];
      const target = prev?.cells[prev.cells.length - 1];
      if (target) {
        target.body += p(
          run(`${field.prefix ?? field.label} `) +
            answerRun(answerOf(answers, field.id))
        );
      }
      continue;
    }
    const next = fields.slice(i + 1).find((f) => !f.joinPrevious);
    rows.push(...fieldRows(field, next, answers, layout));
  }
  return rows;
}

/** `label : value` rows (cover identity block, vendor section header). */
function colonRows(group: VqGroup, answers: VqAnswers, labelW = 4200): Row[] {
  const colonW = 400;
  return group.fields.map((field) => {
    let value: string;
    if (field.kind === "static") {
      value = p(run(field.value ?? "", { bold: true }));
    } else if (field.kind === "checks") {
      value = (field.checks ?? [])
        .map((option) => p(box(ticked(answers[option.id])) + run(option.label)))
        .join("");
    } else {
      value = p(answerRun(answerOf(answers, field.id)));
    }
    return {
      minHeight: 480,
      cells: [
        cell(labelW, p(run(field.label, { bold: true }))),
        cell(colonW, p(run(":", { bold: true }), { jc: "center" })),
        cell(VQ_TABLE_WIDTH - labelW - colonW, value),
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// Matrices (appendix list, impurity tables, CAPA)

function cellText(node: JSONContent): string {
  return richJsonToPlainText({ type: "doc", content: node.content ?? [] }).trim();
}

/** Data rows of the first table in a TipTap doc (header row dropped). */
export function vqTableRows(
  doc: JSONContent | undefined,
  headers: readonly string[]
): string[][] {
  const tableNode = findTable(doc);
  if (!tableNode) return [];
  const rows = (tableNode.content ?? []).map((row) => ({
    header: (row.content ?? []).every((c) => c.type === "tableHeader"),
    cells: (row.content ?? []).map(cellText),
  }));
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const first = rows[0];
  const dropFirst =
    first &&
    (first.header ||
      first.cells.map(normalize).join("|") ===
        headers.map(normalize).join("|"));
  return (dropFirst ? rows.slice(1) : rows)
    .map((row) => row.cells)
    .filter((cells) => cells.some((c) => c.length > 0));
}

function findTable(node: JSONContent | undefined): JSONContent | undefined {
  if (!node) return undefined;
  if (node.type === "table") return node;
  for (const child of node.content ?? []) {
    const hit = findTable(child);
    if (hit) return hit;
  }
  return undefined;
}

function padRows(rows: string[][], width: number, min: number): string[][] {
  const out = rows.map((row) =>
    Array.from({ length: width }, (_, i) => row[i] ?? "")
  );
  while (out.length < min) out.push(Array.from({ length: width }, () => ""));
  return out;
}

function matrixRows(spec: VqMatrixSpec, doc: JSONContent | undefined): Row[] {
  const rows: Row[] = [];
  if (spec.title) {
    rows.push({ keepNext: true, cells: [cell(VQ_TABLE_WIDTH, p(run(spec.title, { bold: true })), { fill: BANNER_FILL })] });
  }
  if (spec.note) {
    rows.push({ keepNext: true, cells: [cell(VQ_TABLE_WIDTH, p(run(spec.note, { bold: !spec.capa })))] });
  }
  const data = vqTableRows(doc, spec.headers);
  if (spec.capa) {
    const widths = [2100, 1900, 900, 900];
    const commentW = VQ_TABLE_WIDTH - widths.reduce((a, b) => a + b, 0);
    rows.push({
      keepNext: true,
      cells: [
        cell(widths[0]!, p(run("CAPA #")), { vMerge: "restart" }),
        cell(widths[1]!, p(run("Target Date")), { vMerge: "restart" }),
        cell(
          widths[2]! + widths[3]! + commentW,
          p(run("Is this completed? If there are any extensions from the target date, please specify in the comments."))
        ),
      ],
    });
    rows.push({
      keepNext: true,
      cells: [
        cell(widths[0]!, "", { vMerge: "continue" }),
        cell(widths[1]!, "", { vMerge: "continue" }),
        choiceCell(widths[2]!, "Yes", false),
        choiceCell(widths[3]!, "No", false),
        cell(commentW, p(run("Comment"))),
      ],
    });
    for (const [capa = "", date = "", done = "", comment = ""] of padRows(data, 4, spec.minRows ?? 0)) {
      const state = done.trim().toLowerCase();
      rows.push({
        minHeight: 440,
        cells: [
          cell(widths[0]!, p(answerRun(capa))),
          cell(widths[1]!, p(answerRun(date))),
          cell(widths[2]!, p(answerRun(state.startsWith("y") ? "✓" : ""), { jc: "center" })),
          cell(widths[3]!, p(answerRun(state.startsWith("n") ? "✓" : ""), { jc: "center" })),
          cell(commentW, p(answerRun(comment))),
        ],
      });
    }
    return rows;
  }
  const count = spec.headers.length;
  const first = count === 2 ? 1700 : 800;
  const other = Math.floor((VQ_TABLE_WIDTH - first) / Math.max(count - 1, 1));
  const widthAt = (i: number) => (i === 0 ? first : other);
  const printed = count === 2 ? ["Ref #\n(Attachment Number)", ""] : spec.headers;
  rows.push({
    keepNext: true,
    cells: printed.map((heading, i) =>
      cell(widthAt(i), p(run(heading, { bold: true }), { jc: count === 2 ? "left" : "center" }))
    ),
  });
  for (const row of padRows(data, count, spec.minRows ?? 0)) {
    rows.push({
      minHeight: 440,
      cells: row.map((value, i) =>
        cell(widthAt(i), p(answerRun(value), { jc: i === 0 && count > 2 ? "center" : "left" }))
      ),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Rich narratives in boxes

export type VqRichRenderer = (doc: JSONContent) => string;

function hasRichText(doc: JSONContent | undefined): doc is JSONContent {
  return Boolean(doc && richJsonToPlainText(doc).trim());
}

/** `Conclusion:` box: bold label then the narrative, like the paper form. */
function narrativeBoxRow(
  labelText: string,
  doc: JSONContent | undefined,
  render: VqRichRenderer
): Row {
  const body = hasRichText(doc) ? render(doc) : "";
  return {
    minHeight: 1100,
    cells: [
      cell(
        VQ_TABLE_WIDTH,
        p(run(labelText, { bold: true })) + body,
        { vAlign: "top" }
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// Sections

function sectionBanner(spec: VqFormSection): Row[] {
  if (!spec.banner) return [];
  const rows: Row[] = [
    {
      keepNext: true,
      cells: [
        cell(
          VQ_TABLE_WIDTH,
          p(run(spec.banner, { bold: true }), { outline: 0 }),
          { fill: SECTION_FILL }
        ),
      ],
    },
  ];
  if (spec.instruction) {
    rows.push({
      keepNext: true,
      cells: [
        cell(
          VQ_TABLE_WIDTH,
          spec.instruction
            .split("\n")
            .map((line) => p(run(line, { bold: true })))
            .join(""),
          { fill: SECTION_FILL }
        ),
      ],
    });
  }
  return rows;
}

function materialHeaderRows(
  spec: VqFormSection,
  key: VqSectionKey,
  answers: VqAnswers,
  identity: VqAnswers
): Row[] {
  if (!spec.materialHeader) return [];
  const prefix = key.replace("vq_section_", "");
  const w = Math.floor(VQ_TABLE_WIDTH / 3);
  const value = (id: string, fallback: string) =>
    answerOf(answers, `${prefix}_${id}`) || answerOf(identity, fallback);
  return [
    {
      keepNext: true,
      cells: [
        cell(w, p(run(spec.materialHeader.nameLabel, { bold: true }), { jc: "center" })),
        cell(w, p(run(spec.materialHeader.typeLabel, { bold: true }), { jc: "center" })),
        cell(VQ_TABLE_WIDTH - 2 * w, p(run("Product Code", { bold: true }), { jc: "center" })),
      ],
    },
    {
      minHeight: 440,
      cells: [
        cell(w, p(answerRun(value("material_name", "a_material_name")))),
        cell(w, p(answerRun(value("chemical_name", "a_chemical_name")))),
        cell(VQ_TABLE_WIDTH - 2 * w, p(answerRun(value("product_code", "a_product_code")))),
      ],
    },
  ];
}

export type VqExportInput = {
  /** Section content by key; missing sections render blank. */
  sections: Partial<Record<VqSectionKey, VqSectionContent>>;
  render: VqRichRenderer;
};

function contentOf(input: VqExportInput, key: VqSectionKey): VqSectionContent {
  return input.sections[key] ?? { answers: {} };
}

/** Rows for one questionnaire section (A–N), excluding relocated groups. */
function questionnaireRows(key: VqSectionKey, input: VqExportInput): Row[] {
  const spec = VQ_FORM[key];
  if (!spec) return [];
  const content = contentOf(input, key);
  const answers = content.answers ?? {};
  const identity = contentOf(input, "vq_section_a").answers ?? {};
  const rows: Row[] = [
    ...sectionBanner(spec),
    ...materialHeaderRows(spec, key, answers, identity),
  ];
  for (const group of spec.groups) {
    if (group.placement || group.colon) continue;
    rows.push(...groupRows(group, answers));
  }
  const narrativeRows = (): Row[] => {
    if (!spec.narrativeLabel) return [];
    if (key === "vq_section_a") {
      return [
        {
          cells: [
            cell(
              VQ_TABLE_WIDTH,
              p(run(spec.narrativeLabel, { bold: true })),
              { fill: BANNER_FILL }
            ),
          ],
        },
        narrativeBoxRow("", content.narrative, input.render),
      ];
    }
    const conclusion = spec.narrativeLabel === "Conclusion";
    // B–F have no comments box on paper; print one only when it has text.
    if (!conclusion && !hasRichText(content.narrative)) return [];
    return [narrativeBoxRow(`${spec.narrativeLabel}:`, content.narrative, input.render)];
  };
  const matrix = spec.matrix ? matrixRows(spec.matrix, content.table) : [];
  if (spec.narrativeFirst) rows.push(...narrativeRows(), ...matrix);
  else rows.push(...matrix, ...narrativeRows());
  for (const group of spec.afterMatrix ?? []) {
    for (const field of group.fields) {
      rows.push({
        minHeight: 1100,
        cells: [
          cell(
            VQ_TABLE_WIDTH,
            p(run(field.label, { bold: true })) +
              p(answerRun(answerOf(answers, field.id))),
            { vAlign: "top" }
          ),
        ],
      });
    }
  }
  return rows;
}

function vendorSectionTable(input: VqExportInput): string {
  const group = VQ_FORM.vq_section_a?.groups.find((g) => g.colon);
  if (!group) return "";
  const answers = contentOf(input, "vq_section_a").answers ?? {};
  return table([
    {
      cells: [
        cell(VQ_TABLE_WIDTH, p(run(group.title, { bold: true }), { jc: "center" })),
      ],
    },
    ...colonRows(group, answers),
  ]);
}

// ---------------------------------------------------------------------------
// Cover (pages 1–3)

function coverXml(input: VqExportInput): string {
  const spec = VQ_FORM.vq_cover!;
  const answers = contentOf(input, "vq_cover").answers ?? {};
  const identity = spec.groups[0]!;
  const rows: Row[] = [...colonRows(identity, answers, 4600)];
  rows.push({
    cells: [
      cell(
        VQ_TABLE_WIDTH,
        p(run("Procedure:", { bold: true }) + run(`    ${spec.instruction ?? ""}`), {
          jc: "both",
          before: 60,
          after: 60,
        })
      ),
    ],
  });
  const sectionW = 1250;
  const reqW = 2500;
  rows.push({
    cells: [
      cell(sectionW, p(run("Section #", { bold: true }), { jc: "center" })),
      cell(VQ_TABLE_WIDTH - sectionW - reqW, p(run("KSM Vendor Assessment Requirement", { bold: true }), { jc: "center" })),
      cell(reqW, p(run("Is required?", { bold: true }), { jc: "center" })),
    ],
  });
  for (const letter of VQ_REQUIRED_SECTION_LETTERS) {
    const value = answerOf(answers, `cover_req_${letter}`).toLowerCase();
    rows.push({
      minHeight: 460,
      cells: [
        cell(sectionW, p(run(`Section ${letter}`))),
        cell(VQ_TABLE_WIDTH - sectionW - reqW, p(run(VQ_REQUIRED_SECTION_TITLES[letter]))),
        cell(
          reqW,
          p(run("Yes ") + box(value === "yes") + run("     No ") + box(value === "no"), {
            jc: "center",
          })
        ),
      ],
    });
  }
  rows.push({
    minHeight: 2600,
    cells: [
      cell(
        VQ_TABLE_WIDTH,
        p(run("Remarks:   ", { bold: true }) + answerRun(answerOf(answers, "cover_remarks"))),
        { vAlign: "top" }
      ),
    ],
  });
  const half = 4800;
  const colon = 400;
  const other = VQ_TABLE_WIDTH - half - colon;
  const issueRow = (leftLabel: string, leftId: string, rightLabel: string, rightId: string): Row => ({
    minHeight: 560,
    cells: [
      cell(half, p(labeled(leftLabel, answerOf(answers, leftId), { bold: true })), { vAlign: "top" }),
      cell(colon, p(run(":"), { jc: "center" })),
      cell(other, p(labeled(rightLabel, answerOf(answers, rightId), { bold: true })), { vAlign: "top" }),
    ],
  });
  rows.push({
    cells: [
      cell(half, p(run("Document Issued By (Quality Assurance)", { bold: true }))),
      cell(colon, p(run(":", { bold: true }), { jc: "center" })),
      cell(other, p(run("Document Received By (SCM)", { bold: true }))),
    ],
  });
  rows.push(issueRow("Name", "cover_issued_name", "Name", "cover_received_name"));
  rows.push(issueRow("Sign & Date", "cover_issued_sign_date", "Sign & Date", "cover_received_sign_date"));
  rows.push({
    cells: [
      cell(
        VQ_TABLE_WIDTH,
        p(run("SUPPLIER QUALITY QUESTIONNAIRE", { bold: true }), { jc: "center", outline: 0 })
      ),
    ],
  });
  return table(rows);
}

function vendorInstructionsXml(input: VqExportInput): string {
  const answers = contentOf(input, "vq_cover").answers ?? {};
  const contacts = VQ_FORM.vq_cover!.groups.find((g) => g.title.startsWith("3xper company contact"));
  const intro = table(
  [
    {
      cells: [
        cell(
          VQ_TABLE_WIDTH,
          p(run("Procedure:", { bold: true }) + run(`  ${VQ_VENDOR_PROCEDURE.lead}`), { jc: "both" }) +
            p(run(VQ_VENDOR_PROCEDURE.contactLine)) +
            VQ_VENDOR_PROCEDURE.bullets
              .map((line) => p(run(`•\t${line}`), { indent: 360, hanging: 360, before: 40, after: 40, jc: "both" }))
              .join("")
        ),
      ],
    },
  ],
  { rowMin: 0 }
  );
  const contactRows = contacts ? colonRows(contacts, answers, 2900) : [];
  return (
    intro +
    table(contactRows.map((row) => ({ ...row, minHeight: 380 })))
  );
}

// ---------------------------------------------------------------------------
// Vendor completion (after J), interim approval, final approval

function vendorCompletionXml(input: VqExportInput): string {
  const spec = VQ_FORM.vq_section_m!;
  const answers = contentOf(input, "vq_section_m").answers ?? {};
  const groups = spec.groups.filter((g) => g.placement === "vendor_completion");
  const rows: Row[] = [];
  const [summary, completion] = groups;
  if (summary) {
    rows.push({
      cells: [
        cell(
          VQ_TABLE_WIDTH,
          p(run(summary.title, { bold: true })) + p(run(summary.note ?? "", { bold: true })),
          { fill: SECTION_FILL }
        ),
      ],
    });
    const ticks = summary.fields[0];
    rows.push({
      cells: [
        cell(
          VQ_TABLE_WIDTH,
          (ticks?.checks ?? [])
            .map((option) => p(box(ticked(answers[option.id])) + run(option.label)))
            .join("")
        ),
      ],
    });
  }
  if (completion) {
    rows.push({
      cells: [
        cell(
          VQ_TABLE_WIDTH,
          p(run(completion.title, { bold: true })) +
            VQ_COMPLETION_STATEMENTS.map((line) =>
              p(run(`▪\t${line}`, { bold: true }), { indent: 720, hanging: 360, before: 60, after: 60 })
            ).join(""),
          { fill: SECTION_FILL }
        ),
      ],
    });
    const labelW = 4700;
    for (const field of completion.fields) {
      if (field.kind === "label") {
        rows.push({ cells: [cell(VQ_TABLE_WIDTH, p(run(field.label, { bold: true })))] });
        continue;
      }
      if (field.wide) {
        rows.push({
          minHeight: field.id.endsWith("recommendation") ? 1700 : 1000,
          cells: [
            cell(
              VQ_TABLE_WIDTH,
              p(run(field.label, { bold: true }) + run("   ") + answerRun(answerOf(answers, field.id))),
              { vAlign: field.id.endsWith("recommendation") ? "center" : "top" }
            ),
          ],
        });
        continue;
      }
      rows.push({
        minHeight: field.label.startsWith("Signature") ? 640 : 400,
        cells: [
          cell(labelW, p(run(field.label))),
          cell(VQ_TABLE_WIDTH - labelW, p(answerRun(answerOf(answers, field.id)), { jc: "center" })),
        ],
      });
    }
  }
  return table(rows);
}

/** Two-column Name / Designation / Sign / Date block. */
function approvalPairRows(
  answers: VqAnswers,
  left: { title: string; prefix: string },
  right: { title: string; prefix: string }
): Row[] {
  const half = Math.floor(VQ_TABLE_WIDTH / 2);
  const rows: Row[] = [
    {
      cells: [
        cell(half, p(run(left.title, { bold: true }))),
        cell(VQ_TABLE_WIDTH - half, p(run(right.title, { bold: true }))),
      ],
    },
  ];
  for (const [labelText, suffix] of [
    ["Name:", "name"],
    ["Designation:", "designation"],
    ["Sign:", "sign"],
    ["Date:", "date"],
  ] as const) {
    rows.push({
      minHeight: 600,
      cells: [
        cell(half, p(labeled(labelText, answerOf(answers, `${left.prefix}_${suffix}`), { bold: true })), { vAlign: "top" }),
        cell(VQ_TABLE_WIDTH - half, p(labeled(labelText, answerOf(answers, `${right.prefix}_${suffix}`), { bold: true })), { vAlign: "top" }),
      ],
    });
  }
  return rows;
}

function interimApprovalXml(input: VqExportInput): string {
  const answers = contentOf(input, "vq_scoring").answers ?? {};
  return table([
    {
      cells: [
        cell(
          VQ_TABLE_WIDTH,
          p(run("Interim Approval of Vendor Qualification: (3xper Innoventure Ltd)", { bold: true }))
        ),
      ],
    },
    ...approvalPairRows(
      answers,
      { title: "Document Verified by\n(Quality Assurance)", prefix: "interim_verified" },
      { title: "Vendor Approved by\n(Quality Assurance)", prefix: "interim_approved" }
    ),
  ]);
}

function finalApprovalXml(input: VqExportInput): string {
  const content = contentOf(input, "vq_scoring");
  const answers = content.answers ?? {};
  const spec = VQ_FORM.vq_scoring!;
  const summary = spec.groups.find((g) => g.title.startsWith("Summary of vendor"));
  const rows: Row[] = [];
  if (summary) {
    rows.push({
      cells: [
        cell(
          VQ_TABLE_WIDTH,
          p(run(summary.title, { bold: true })) + p(run(summary.note ?? "", { bold: true })),
          { fill: SECTION_FILL }
        ),
      ],
    });
    const ticks = summary.fields.find((f) => f.kind === "checks");
    rows.push({
      cells: [
        cell(
          VQ_TABLE_WIDTH,
          (ticks?.checks ?? [])
            .map((option) => p(box(ticked(answers[option.id])) + run(option.label)))
            .join("")
        ),
      ],
    });
    const questionW = 5400;
    const answerW = VQ_TABLE_WIDTH - questionW;
    for (const field of summary.fields) {
      const value = answerOf(answers, field.id).toLowerCase();
      if (field.kind === "yes_no") {
        const half = Math.floor(answerW / 2);
        rows.push({
          cells: [
            cell(questionW, p(run(field.label))),
            cell(half, p(run("Yes ") + box(value === "yes"), { jc: "center" })),
            cell(answerW - half, p(run("No ") + box(value === "no"), { jc: "center" })),
          ],
        });
      } else if (field.kind === "yes_no_na") {
        const half = Math.floor(answerW / 2);
        const third = Math.floor((answerW - half) / 2);
        rows.push({
          cells: [
            cell(questionW, p(run(field.label))),
            cell(half, p(run("Yes ") + box(value === "yes"), { jc: "center" })),
            cell(third, p(run("No ") + box(value === "no"), { jc: "center" })),
            cell(answerW - half - third, p(run("NA ") + box(value === "na"), { jc: "center" })),
          ],
        });
      } else if (field.kind === "choice") {
        // Paper: "approved / conditionally /not approved" — strike what does not apply.
        const chosen = answerOf(answers, field.id);
        const option = (v: string, textValue: string) =>
          run(textValue, { strike: Boolean(chosen) && chosen !== v, bold: chosen === v });
        rows.push({
          cells: [
            cell(questionW, p(run(field.label))),
            cell(
              answerW,
              p(
                run("The vendor is ") +
                  option("approved", "approved") +
                  run(" / ") +
                  option("conditionally", "conditionally") +
                  run(" /") +
                  option("not_approved", "not approved") +
                  run(" for routine supply.")
              )
            ),
          ],
        });
      } else if (field.wide) {
        const narrative = hasRichText(content.narrative) ? input.render(content.narrative) : "";
        rows.push({
          minHeight: 900,
          cells: [
            cell(
              VQ_TABLE_WIDTH,
              p(run(field.label) + run("  ") + answerRun(answerOf(answers, field.id))) + narrative,
              { vAlign: "top" }
            ),
          ],
        });
      }
    }
  }
  const first = table(rows);

  const colW = 1250;
  const bandW = Math.floor((VQ_TABLE_WIDTH - colW * 3) / 4);
  const scoringLabel = (textValue: string) => p(run(textValue, { bold: true }), { jc: "center" });
  const band = (id: string, textValue: string, w: number) =>
    cell(w, p(run(`${textValue} `) + box(ticked(answers[id])), { jc: "center" }));
  const lastBandW = VQ_TABLE_WIDTH - colW * 3 - bandW * 3;
  const guidance =
    p(run("Note: ", { bold: true }) + run("Refer to the guidance below to complete above table."), { before: 60 }) +
    p("") +
    VQ_SCORING_GUIDANCE.map(([term, meaning]) => p(run(`${term} `, { bold: true }) + run(meaning))).join("") +
    p("") +
    VQ_SCORING_OUTCOMES.map(([term, meaning]) => p(run(`${term} `, { bold: true }) + run(meaning), { jc: "both" })).join("");
  const second = table([
    {
      cells: [
        cell(
          VQ_TABLE_WIDTH,
          p(run("Approval of Vendor Qualification: (3xper Innoventure Ltd)", { bold: true }), { outline: 0 })
        ),
      ],
    },
    {
      cells: [
        cell(colW, scoringLabel("Total questions")),
        cell(colW, scoringLabel("Total mandatory fields")),
        cell(colW, scoringLabel("Total answered fields")),
        cell(VQ_TABLE_WIDTH - colW * 3, scoringLabel("Questionnaire Scoring")),
      ],
    },
    {
      minHeight: 420,
      cells: [
        cell(colW, p(answerRun(answerOf(answers, "score_total_questions")), { jc: "center" })),
        cell(colW, p(answerRun(answerOf(answers, "score_total_mandatory")), { jc: "center" })),
        cell(colW, p(answerRun(answerOf(answers, "score_total_answered")), { jc: "center" })),
        band("score_excellent", "Excellent", bandW),
        band("score_good", "Good", bandW),
        band("score_fair", "Fair", bandW),
        band("score_poor", "Poor", lastBandW),
      ],
    },
    { cells: [cell(VQ_TABLE_WIDTH, guidance, { vAlign: "top" })] },
    ...approvalPairRows(
      answers,
      {
        title: "Vendor Qualification Document assessed by\n(Quality Assurance)",
        prefix: "final_assessed",
      },
      { title: "Vendor Approved by\n(Quality Assurance)", prefix: "final_approved" }
    ),
  ]);
  return first + spacer(0) + second;
}

// ---------------------------------------------------------------------------
// Public entry points

/** Whole document body: cover, vendor instructions, sections A–N, approvals. */
export function vqBodyXml(input: VqExportInput): string {
  const parts: string[] = [
    coverXml(input),
    pageBreak(),
    vendorInstructionsXml(input),
    pageBreak(),
    vendorSectionTable(input),
    spacer(),
  ];
  for (const key of VQ_SECTION_KEYS) {
    if (key === "vq_cover" || key === "vq_scoring") continue;
    parts.push(table(questionnaireRows(key, input)), spacer());
    if (key === "vq_section_j") {
      parts.push(vendorCompletionXml(input), spacer(), interimApprovalXml(input), spacer());
    }
  }
  parts.push(finalApprovalXml(input));
  return parts.join("");
}

/** Signature table + `Format:` line printed at the bottom of every page. */
export function vqPageFooterXml(rows: VqPageSignatureRow[]): string {
  const widths = [2150, 2150, 2400, 1840, 1900];
  const header: Row = {
    cells: VQ_PAGE_SIGNATURE_HEADERS.map((heading, i) =>
      cell(widths[i]!, p(run(heading, { bold: true, sz: SMALL_SZ }), { jc: "center", before: 0, after: 0 }))
    ),
  };
  const body: Row[] = rows.map((row) => ({
    minHeight: 340,
    cells: [row.activity, row.name, row.designation, row.signature, row.date].map(
      (value, i) =>
        cell(widths[i]!, p(run(value, { sz: SMALL_SZ }), { jc: "center", before: 0, after: 0 }))
    ),
  }));
  return (
    table([header, ...body], { rowMin: 0 }) +
    p(run(`Format: - ${VQ_FORM_NO}`, { italic: true, sz: 18 }), { before: 0, after: 0 })
  );
}

export function vqPageSignaturesFor(content: VqSectionContent | undefined): VqPageSignatureRow[] {
  return parseVqPageSignatures(content?.pageSignatures);
}
