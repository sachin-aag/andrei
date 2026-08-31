export type SourceToken = {
  raw: string;
  start: number;
};

export type BlankedTableCell = {
  row: number;
  column: number;
};

export type VerifyTableWriteResult = {
  columns: string[][];
  blanked: BlankedTableCell[];
};

const SOURCE_TOKEN_RE =
  /\d{1,2}:\d{2}|[+-]?(?:\d+\.\d+|\d+|\.\d+)|[A-Za-z][A-Za-z0-9._/-]*/g;

const INTEGER_TOKEN_RE = /^-?\d+$/;
const LABEL_CELL_RE = /[A-Za-z]/;
const MAX_SPAN_TOKENS = 8;

export function tokenizeSourceText(text: string): SourceToken[] {
  const tokens: SourceToken[] = [];
  const re = new RegExp(SOURCE_TOKEN_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    tokens.push({ raw: match[0], start: match.index });
  }
  return tokens;
}

export function cellMatchesToken(cell: string, token: string): boolean {
  const trimmed = cell.trim();
  if (!trimmed) return false;
  if (trimmed === token) return true;
  if (
    INTEGER_TOKEN_RE.test(trimmed) &&
    INTEGER_TOKEN_RE.test(token) &&
    Number(trimmed) === Number(token)
  ) {
    return true;
  }
  return false;
}

/** Strip spaces and hyphens so "Tip 1" matches "Tip 1" and "P33-0924- 10017" matches "P33-0924-10017". */
export function compactCellText(value: string): string {
  return value.replace(/[\s-]+/g, "");
}

function spanOverlapsUsed(
  start: number,
  endExclusive: number,
  used: ReadonlySet<number>
): boolean {
  for (let index = start; index < endExclusive; index++) {
    if (used.has(index)) return true;
  }
  return false;
}

function markSpanUsed(
  used: Set<number>,
  start: number,
  endExclusive: number
): void {
  for (let index = start; index < endExclusive; index++) {
    used.add(index);
  }
}

/**
 * Exclusive end token index of a span starting at `start` that matches `cell`,
 * or -1. One token uses `cellMatchesToken`; longer spans compare compacted
 * source substring to compacted cell (OCR often splits "Tip 1" and SNs).
 */
export function matchCellTokenSpan(
  cell: string,
  tokens: readonly SourceToken[],
  start: number,
  sourceText: string
): number {
  const trimmed = cell.trim();
  if (!trimmed || start < 0 || start >= tokens.length) return -1;
  if (cellMatchesToken(trimmed, tokens[start]!.raw)) {
    return start + 1;
  }
  const want = compactCellText(trimmed);
  if (!want) return -1;
  const spanStart = tokens[start]!.start;
  const max = Math.min(tokens.length, start + MAX_SPAN_TOKENS);
  for (let end = start + 1; end <= max; end++) {
    const last = tokens[end - 1]!;
    const compact = compactCellText(
      sourceText.slice(spanStart, last.start + last.raw.length)
    );
    if (compact === want) return end;
    if (compact.length > want.length || !want.startsWith(compact)) {
      return -1;
    }
  }
  return -1;
}

function cellString(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).trim();
}

function isLabelCell(value: string): boolean {
  return LABEL_CELL_RE.test(value);
}

type Assignment = {
  values: string[];
  lastUsedToken: number;
  blankedColumns: number[];
};

function assignNumericCells(input: {
  tokens: readonly SourceToken[];
  sourceText: string;
  filled: Array<{ column: number; value: string }>;
  start: number;
  used: ReadonlySet<number>;
}): { lastUsedToken: number; blankedColumns: number[] } {
  const filledCount = input.filled.length;
  const tokenCount = input.tokens.length;
  const blankedColumns: number[] = [];
  if (filledCount === 0) {
    return { lastUsedToken: input.start - 1, blankedColumns };
  }

  const skipKept: number[][] = Array.from({ length: filledCount + 1 }, () =>
    Array<number>(tokenCount + 1).fill(0)
  );
  const takeStart: number[][] = Array.from({ length: filledCount }, () =>
    Array<number>(tokenCount + 1).fill(-1)
  );
  const takeEnd: number[][] = Array.from({ length: filledCount }, () =>
    Array<number>(tokenCount + 1).fill(-1)
  );

  for (let f = filledCount - 1; f >= 0; f--) {
    const value = input.filled[f]!.value;
    for (let t = tokenCount; t >= input.start; t--) {
      const skipped = skipKept[f + 1]![t]!;
      let best = skipped;
      let chosenStart = -1;
      let chosenEnd = -1;
      for (let j = t; j < tokenCount; j++) {
        if (input.used.has(j)) continue;
        const end = matchCellTokenSpan(
          value,
          input.tokens,
          j,
          input.sourceText
        );
        if (end < 0) continue;
        if (spanOverlapsUsed(j, end, input.used)) continue;
        const keptCount = 1 + skipKept[f + 1]![end]!;
        if (keptCount > best) {
          best = keptCount;
          chosenStart = j;
          chosenEnd = end;
        }
      }
      skipKept[f]![t] = best;
      takeStart[f]![t] = chosenStart;
      takeEnd[f]![t] = chosenEnd;
    }
  }

  let t = input.start;
  let lastUsedToken = input.start - 1;
  for (let f = 0; f < filledCount; f++) {
    const at = Math.min(t, tokenCount);
    const chosenStart = takeStart[f]![at] ?? -1;
    const chosenEnd = takeEnd[f]![at] ?? -1;
    const column = input.filled[f]!.column;
    if (chosenStart < 0 || chosenEnd < 0) {
      blankedColumns.push(column);
      continue;
    }
    lastUsedToken = Math.max(lastUsedToken, chosenEnd - 1);
    t = chosenEnd;
  }

  return { lastUsedToken, blankedColumns };
}

function assignRowToTokens(
  tokens: readonly SourceToken[],
  sourceText: string,
  cells: readonly string[],
  minTokenIndex: number
): Assignment {
  const filled: Array<{ column: number; value: string }> = [];
  for (let column = 0; column < cells.length; column++) {
    const value = cellString(cells[column]);
    if (value) filled.push({ column, value });
  }

  const tokenCount = tokens.length;
  const start = Math.max(0, minTokenIndex);
  if (filled.length === 0 || start >= tokenCount) {
    return {
      values: cells.map((cell) => cellString(cell)),
      lastUsedToken: minTokenIndex - 1,
      blankedColumns: filled.map((item) => item.column),
    };
  }

  const labels = filled.filter((item) => isLabelCell(item.value));
  const numerics = filled.filter((item) => !isLabelCell(item.value));
  const used = new Set<number>();
  const values = cells.map((cell) => cellString(cell));
  const blankedColumns: number[] = [];
  let lastUsedToken = minTokenIndex - 1;

  for (const label of labels) {
    let foundStart = -1;
    let foundEnd = -1;
    for (let j = start; j < tokenCount; j++) {
      if (used.has(j)) continue;
      const end = matchCellTokenSpan(label.value, tokens, j, sourceText);
      if (end < 0) continue;
      if (spanOverlapsUsed(j, end, used)) continue;
      foundStart = j;
      foundEnd = end;
      break;
    }
    if (foundStart < 0 || foundEnd < 0) {
      values[label.column] = "";
      blankedColumns.push(label.column);
      continue;
    }
    markSpanUsed(used, foundStart, foundEnd);
    lastUsedToken = Math.max(lastUsedToken, foundEnd - 1);
  }

  const numeric = assignNumericCells({
    tokens,
    sourceText,
    filled: numerics,
    start,
    used,
  });
  for (const column of numeric.blankedColumns) {
    values[column] = "";
    blankedColumns.push(column);
  }
  lastUsedToken = Math.max(lastUsedToken, numeric.lastUsedToken);

  return { values, lastUsedToken, blankedColumns };
}

export function verifyTableWrite(input: {
  sourceText: string;
  columns: Array<readonly (string | number)[]>;
}): VerifyTableWriteResult {
  const tokens = tokenizeSourceText(input.sourceText);
  const columnCount = input.columns.length;
  const rowCount = input.columns.reduce(
    (max, column) => Math.max(max, column.length),
    0
  );
  const verified: string[][] = input.columns.map((column) =>
    Array.from({ length: rowCount }, (_, row) => cellString(column[row]))
  );
  const blanked: BlankedTableCell[] = [];
  let minTokenIndex = 0;

  for (let row = 0; row < rowCount; row++) {
    const cells = verified.map((column) => column[row] ?? "");
    const assigned = assignRowToTokens(
      tokens,
      input.sourceText,
      cells,
      minTokenIndex
    );
    for (let column = 0; column < columnCount; column++) {
      verified[column]![row] = assigned.values[column] ?? "";
    }
    for (const column of assigned.blankedColumns) {
      blanked.push({ row: row + 1, column });
    }
    if (assigned.lastUsedToken >= minTokenIndex) {
      minTokenIndex = assigned.lastUsedToken + 1;
    }
  }

  return { columns: verified, blanked };
}
