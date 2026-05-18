import { Table } from "@tiptap/extension-table";

/** Word `tblGrid` → `gridCol/@w:w` widths (twips/dxa); preserved DOCX-import → export round-trip only. */
export const TableWithColumnWidths = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      colWidths: {
        default: null as number[] | null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    };
  },
});
