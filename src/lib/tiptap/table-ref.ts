import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { TableRefNodeView } from "@/components/report/tiptap/table-ref-node-view";
import {
  TABLE_REF_NODE_TYPE,
  tableRefDisplayText,
} from "@/lib/tiptap/table-ref-markdown";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableRef: {
      insertTableRef: (attrs: {
        section?: string;
        targetField?: string;
        tableIndex?: number;
        n?: number | null;
      }) => ReturnType;
    };
  }
}

export const TableRef = Node.create({
  name: TABLE_REF_NODE_TYPE,

  group: "inline",

  inline: true,

  atom: true,

  selectable: true,

  marks: "suggestionInsert suggestionDelete",

  addAttributes() {
    return {
      section: { default: "" },
      targetField: { default: "" },
      tableIndex: { default: 0 },
      n: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-table-ref="true"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const n =
      typeof node.attrs.n === "number" ? (node.attrs.n as number) : null;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-table-ref": "true",
        "data-section": node.attrs.section ?? "",
        "data-target-field": node.attrs.targetField ?? "",
        "data-table-index": String(node.attrs.tableIndex ?? 0),
        "data-n": n == null ? "" : String(n),
        class: "tiptap-table-ref",
      }),
      tableRefDisplayText({ n }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableRefNodeView);
  },

  addCommands() {
    return {
      insertTableRef:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              section: attrs.section ?? "",
              targetField: attrs.targetField ?? "",
              tableIndex: attrs.tableIndex ?? 0,
              n: attrs.n ?? null,
            },
          }),
    };
  },
});
