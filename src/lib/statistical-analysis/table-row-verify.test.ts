import { describe, expect, it } from "vitest";
import {
  cellMatchesToken,
  tokenizeSourceText,
  verifyTableWrite,
} from "./table-row-verify";

const INTACT_ROW_2 =
  "02:57 05 36.9 6.99 875 38 2 50.2 0.50 17.2 12.5 0 0 0 yes";
const INTACT_ROW_3 =
  "05Hr 03:12 37.2 6.99 875 38 3 58.3 0.50 21.05 11.0 0 0 0 yes";
const AIR_THEN_DO_NO_O2 = "01:57 04 37.4 6.99 875 38 47.9 0.50 9.17 15.25 0 0 0 yes";
const O2_LEADING_ZERO = "875 38.02 02 73.2 0.50";

describe("table-row-verify", () => {
  it("treats leading-zero integers as the same token as the integer", () => {
    expect(cellMatchesToken("2", "02")).toBe(true);
    expect(cellMatchesToken("02", "2")).toBe(true);
    expect(cellMatchesToken("0", "02")).toBe(false);
    expect(cellMatchesToken("0.02", "02")).toBe(false);
    expect(cellMatchesToken("38", "38.02")).toBe(false);
  });

  it("keeps O2 2 and 3 on intact rows between Air and DO", () => {
    const sourceText = `${INTACT_ROW_2}\n${INTACT_ROW_3}`;
    const verified = verifyTableWrite({
      sourceText,
      columns: [
        [875, 875],
        [38, 38],
        [2, 3],
        [50.2, 58.3],
      ],
    });
    expect(verified.columns[2]).toEqual(["2", "3"]);
    expect(verified.blanked).toEqual([]);
  });

  it("blanks O2 0 when 2 sits between Air and DO on the same row", () => {
    const verified = verifyTableWrite({
      sourceText: INTACT_ROW_2,
      columns: [[875], [38], [0], [50.2]],
    });
    expect(verified.columns[2]).toEqual([""]);
    expect(verified.columns[3]).toEqual(["50.2"]);
    expect(verified.blanked).toEqual([{ row: 1, column: 2 }]);
  });

  it("rejects invented 0.02 when the page token is 02", () => {
    const verified = verifyTableWrite({
      sourceText: O2_LEADING_ZERO,
      columns: [[875], [38.02], [0.02], [73.2]],
    });
    expect(verified.columns[2]).toEqual([""]);
    expect(verified.columns[1]).toEqual(["38.02"]);
    expect(verified.blanked).toEqual([{ row: 1, column: 2 }]);
  });

  it("blanks O2 when Air is followed by DO with no O2 token", () => {
    const verified = verifyTableWrite({
      sourceText: AIR_THEN_DO_NO_O2,
      columns: [[875], [38], [0], [47.9]],
    });
    expect(verified.columns[2]).toEqual([""]);
    expect(verified.columns[3]).toEqual(["47.9"]);
    expect(verified.blanked).toEqual([{ row: 1, column: 2 }]);
  });

  it("does not treat 0.50 as a match for 0", () => {
    expect(
      tokenizeSourceText("38 2 50.2 0.50 0").map((token) => token.raw)
    ).toEqual(["38", "2", "50.2", "0.50", "0"]);
    expect(cellMatchesToken("0", "0.50")).toBe(false);
  });
});
