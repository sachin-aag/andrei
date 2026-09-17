"use client";

import { createContext, useMemo, type ReactNode } from "react";
import type { DocumentType } from "@/db/schema";
import {
  documentContentsFromReportState,
  type TableNumberComment,
} from "@/lib/suggestions/document-table-number";
import {
  listInsertableTableRefs,
  resolveTableRefTarget,
  tableRefMapKey,
  tableRefNumberMap,
  type InsertableTableRef,
} from "@/lib/suggestions/table-ref";
import type { TableRefAttrs } from "@/lib/tiptap/table-ref-markdown";

export type TableRefFieldScope = {
  section: string;
  targetField: string;
};

export type TableRefNumbersValue = {
  map: ReadonlyMap<string, number>;
  insertable: readonly InsertableTableRef[];
  documentType: DocumentType | null;
};

export const TableRefFieldContext = createContext<TableRefFieldScope | null>(
  null
);

export const TableRefNumbersContext = createContext<TableRefNumbersValue>({
  map: new Map(),
  insertable: [],
  documentType: null,
});

export function TableRefNumbersProvider({
  documentType,
  sections,
  comments,
  children,
}: {
  documentType: DocumentType;
  sections: Readonly<Partial<Record<string, unknown>>>;
  comments: readonly TableNumberComment[];
  children: ReactNode;
}) {
  const value = useMemo(() => {
    const contents = documentContentsFromReportState({
      documentType,
      sections,
      comments,
    });
    return {
      map: tableRefNumberMap(contents),
      insertable: listInsertableTableRefs(contents),
      documentType,
    };
  }, [documentType, sections, comments]);

  return (
    <TableRefNumbersContext value={value}>{children}</TableRefNumbersContext>
  );
}

export function lookupTableRefNumber(
  numbers: TableRefNumbersValue,
  attrs: TableRefAttrs,
  containing: TableRefFieldScope | null
): number | null {
  const target = resolveTableRefTarget(
    attrs,
    containing ?? { section: attrs.section, targetField: attrs.targetField },
    numbers.documentType
  );
  const live = numbers.map.get(tableRefMapKey(target));
  if (typeof live === "number") return live;
  if (typeof attrs.n === "number" && Number.isFinite(attrs.n) && attrs.n > 0) {
    return attrs.n;
  }
  return null;
}
