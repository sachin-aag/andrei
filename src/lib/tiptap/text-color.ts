import type { JSONContent } from "@tiptap/core";

/** Word OOXML `w:color/@w:val` (RRGGBB) → CSS hex for TipTap `textStyle.color`. */
export function wordColorValToCss(val: string | undefined | null): string | undefined {
  if (!val) return undefined;
  const normalized = val.trim().toLowerCase();
  if (normalized === "auto") return undefined;
  if (!/^[0-9a-f]{6}$/.test(normalized)) return undefined;
  if (normalized === "000000") return undefined;
  return `#${normalized}`;
}

/** TipTap/CSS hex → Word OOXML `w:color/@w:val` (RRGGBB, uppercase). */
export function cssColorToWordVal(css: string | undefined | null): string | null {
  if (!css) return null;
  let hex = css.trim();
  if (hex.startsWith("#")) hex = hex.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const upper = hex.toUpperCase();
  if (upper === "000000") return null;
  return upper;
}

export function colorFromTextMarks(
  marks: JSONContent["marks"] | undefined
): string | undefined {
  const mark = marks?.find((m) => m.type === "textStyle");
  const color = mark?.attrs?.color;
  return typeof color === "string" && color.trim() ? color : undefined;
}

/** Normalize to #rrggbb for `<input type="color">`. */
export function normalizeColorInputValue(color: string | undefined): string {
  const css = color?.startsWith("#") ? color : color ? `#${color}` : "#000000";
  const word = cssColorToWordVal(css);
  return word ? `#${word.toLowerCase()}` : "#000000";
}

export const FONT_COLOR_PRESETS = [
  { label: "Red", value: "#FF0000" },
  { label: "Blue", value: "#0070C0" },
  { label: "Green", value: "#00B050" },
  { label: "Orange", value: "#FFC000" },
  { label: "Purple", value: "#7030A0" },
  { label: "Dark red", value: "#C00000" },
] as const;
