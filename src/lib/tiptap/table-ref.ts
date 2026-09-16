import {
  InputRule,
  Node,
  mergeAttributes,
  nodePasteRule,
  type Editor,
} from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { TableRefNodeView } from "@/components/report/tiptap/table-ref-node-view";
import {
  TABLE_REF_INPUT_RE,
  TABLE_REF_NODE_TYPE,
  TABLE_REF_TOKEN_RE,
  parseTableRefSpec,
  tableRefAttrsFromNode,
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

  renderText({ node }) {
    return tableRefDisplayText(
      tableRefAttrsFromNode({ type: TABLE_REF_NODE_TYPE, attrs: node.attrs })
    );
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

  addInputRules() {
    return [
      new InputRule({
        find: TABLE_REF_INPUT_RE,
        handler: ({ state, range, match }) => {
          const parsed = parseTableRefSpec(match[1]);
          const node = this.type.create({
            section: parsed.section,
            targetField: parsed.targetField,
            tableIndex: parsed.tableIndex,
            n: parsed.n,
          });
          state.tr.replaceWith(range.from, range.to, node);
        },
      }),
    ];
  },

  addPasteRules() {
    return [
      nodePasteRule({
        find: new RegExp(TABLE_REF_TOKEN_RE.source, "gi"),
        type: this.type,
        getAttributes: (match) => parseTableRefSpec(match[1]),
      }),
    ];
  },
});

export function insertTableRefFromPicker(
  editor: Editor,
  attrs: {
    section: string;
    targetField: string;
    tableIndex: number;
    n?: number | null;
  }
): boolean {
  return editor
    .chain()
    .focus()
    .insertTableRef({
      section: attrs.section,
      targetField: attrs.targetField,
      tableIndex: attrs.tableIndex,
      n: attrs.n ?? null,
    })
    .run();
}
