import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";

type VerticalAlign = "top" | "middle" | "bottom";

function verticalAlignFromElement(el: Element): VerticalAlign | null {
  const style =
    el instanceof HTMLElement ? el.style.verticalAlign : "";
  const raw = style.trim().toLowerCase();
  if (raw === "top" || raw === "middle" || raw === "bottom") return raw;
  return null;
}

/** Extends stock table cells with vertical alignment (horizontal `align` is built into Tiptap). */
export const TableCellWithVerticalAlign = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      verticalAlign: {
        default: null,
        parseHTML: (element) => verticalAlignFromElement(element),
        renderHTML: (attributes) => {
          if (!attributes.verticalAlign) return {};
          return {
            style: `vertical-align: ${attributes.verticalAlign}`,
          };
        },
      },
    };
  },
});

export const TableHeaderWithVerticalAlign = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      verticalAlign: {
        default: null,
        parseHTML: (element) => verticalAlignFromElement(element),
        renderHTML: (attributes) => {
          if (!attributes.verticalAlign) return {};
          return {
            style: `vertical-align: ${attributes.verticalAlign}`,
          };
        },
      },
    };
  },
});
