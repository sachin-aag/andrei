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
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";

function formattingClassName(
  marks: NodeViewProps["node"]["marks"]
): string | undefined {
  const names = new Set(marks.map((mark) => mark.type.name));
  return (
    cn(
      names.has("bold") && "font-bold",
      names.has("italic") && "italic"
    ) || undefined
  );
}

function suggestionAppearance(marks: NodeViewProps["node"]["marks"]): {
  className?: string;
  evalId?: string;
} {
  for (const mark of marks) {
    const name = mark.type.name;
    if (name !== suggestionInsertMarkName && name !== suggestionDeleteMarkName) {
      continue;
    }
    const isAi = mark.attrs.authorId === "ai";
    const kind =
      typeof mark.attrs.kind === "string" ? mark.attrs.kind : "fix";
    const evalId =
      typeof mark.attrs.id === "string" ? mark.attrs.id : undefined;
    const kindClass =
      name === suggestionInsertMarkName ? "insert" : "delete";
    return {
      className: cn(
        `suggestion-${kindClass}`,
        `suggestion-${kindClass}-${kind}`,
        isAi && `suggestion-${kindClass}-ai`
      ),
      evalId,
    };
  }
  return {};
}

export function TableRefNodeView({ node, selected }: NodeViewProps) {
  const field = use(TableRefFieldContext);
  const numbers = use(TableRefNumbersContext);
  const attrs = tableRefAttrsFromNode({
    type: "tableRef",
    attrs: node.attrs,
  });
  const n = lookupTableRefNumber(numbers, attrs, field);
  const label = tableRefDisplayText({ n });
  const suggestion = suggestionAppearance(node.marks);

  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        "tiptap-table-ref underline decoration-dotted underline-offset-2",
        formattingClassName(node.marks),
        suggestion.className,
        selected && "ring-2 ring-[var(--ring)] rounded-sm"
      )}
      contentEditable={false}
      data-table-ref="true"
      data-eval-id={suggestion.evalId}
    >
      {label}
    </NodeViewWrapper>
  );
}
