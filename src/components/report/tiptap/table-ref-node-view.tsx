"use client";

import { use } from "react";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { cn } from "@/lib/utils";
import {
  lookupTableRefNumber,
  TableRefFieldContext,
  TableRefNumbersContext,
} from "@/providers/table-ref-numbers";
import {
  tableRefAttrsFromNode,
  tableRefDisplayText,
} from "@/lib/tiptap/table-ref-markdown";

export function TableRefNodeView({ node, selected }: NodeViewProps) {
  const field = use(TableRefFieldContext);
  const numbers = use(TableRefNumbersContext);
  const attrs = tableRefAttrsFromNode({
    type: "tableRef",
    attrs: node.attrs,
  });
  const n = lookupTableRefNumber(numbers, attrs, field);
  const label = tableRefDisplayText({ n });

  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        "tiptap-table-ref underline decoration-dotted underline-offset-2",
        selected && "ring-2 ring-[var(--ring)] rounded-sm"
      )}
      contentEditable={false}
      data-table-ref="true"
    >
      {label}
    </NodeViewWrapper>
  );
}
