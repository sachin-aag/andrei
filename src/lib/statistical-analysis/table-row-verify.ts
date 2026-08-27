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

function cellString(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).trim();
}

type Assignment = {
  values: string[];
  lastUsedToken: number;
  blankedColumns: number[];
};

function assignRowToTokens(
  tokens: readonly SourceToken[],
  cells: readonly string[],
  minTokenIndex: number
): Assignment {
  const filled: Array<{ column: number; value: string }> = [];
  for (let column = 0; column < cells.length; column++) {
    const value = cellString(cells[column]);
    if (value) filled.push({ column, value });
  }

  const filledCount = filled.length;
  const tokenCount = tokens.length;
  const start = Math.max(0, minTokenIndex);
  if (filledCount === 0 || start >= tokenCount) {
    return {
      values: cells.map((cell) => cellString(cell)),
      lastUsedToken: minTokenIndex - 1,
      blankedColumns: filled.map((item) => item.column),
    };
  }

  const skipKept: number[][] = Array.from({ length: filledCount + 1 }, () =>
    Array<number>(tokenCount + 1).fill(0)
  );
  const takeToken: number[][] = Array.from({ length: filledCount }, () =>
    Array<number>(tokenCount + 1).fill(-1)
  );

  for (let f = filledCount - 1; f >= 0; f--) {
    const value = filled[f]!.value;
    for (let t = tokenCount; t >= start; t--) {
      const skipped = skipKept[f + 1]![t]!;
      let best = skipped;
      let chosen = -1;
      for (let j = t; j < tokenCount; j++) {
        if (!cellMatchesToken(value, tokens[j]!.raw)) continue;
        const kept = 1 + skipKept[f + 1]![j + 1]!;
        if (kept > best) {
          best = kept;
          chosen = j;
        }
      }
      skipKept[f]![t] = best;
      takeToken[f]![t] = chosen;
    }
  }

  const values = cells.map((cell) => cellString(cell));
  const blankedColumns: number[] = [];
  let t = start;
  let lastUsedToken = minTokenIndex - 1;
  for (let f = 0; f < filledCount; f++) {
    const chosen = takeToken[f]![Math.min(t, tokenCount)] ?? -1;
    const column = filled[f]!.column;
    if (chosen < 0) {
      values[column] = "";
      blankedColumns.push(column);
      continue;
    }
    lastUsedToken = chosen;
    t = chosen + 1;
  }

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
    const assigned = assignRowToTokens(tokens, cells, minTokenIndex);
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
