import StarterKit from "@tiptap/starter-kit";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { TableRow } from "@tiptap/extension-table-row";
import { BulletListWithStyle } from "@/lib/tiptap/bullet-list-with-style";
import { ImageInline } from "@/lib/tiptap/image-inline";
import { MathBlock, MathInline } from "@/lib/tiptap/math-nodes";
import { TableCellWithVerticalAlign, TableHeaderWithVerticalAlign } from "@/lib/tiptap/table-cell-vertical-align";
import { TableWithColumnWidths } from "@/lib/tiptap/table-column-widths";

/** Extensions for read-only rich-text preview (tables, equations, images). */
export function createReadOnlyRichTextExtensions() {
  return [
    StarterKit.configure({
      heading: false,
      bulletList: false,
    }),
    BulletListWithStyle,
    Subscript,
    Superscript,
    TextStyle,
    Color,
    ImageInline,
    MathInline,
    MathBlock,
    TableWithColumnWidths.configure({ resizable: false }),
    TableRow,
    TableCellWithVerticalAlign,
    TableHeaderWithVerticalAlign,
  ];
}
