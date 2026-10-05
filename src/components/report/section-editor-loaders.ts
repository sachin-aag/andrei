"use client";

import { useEffect, useState, type ComponentType } from "react";
import type { DocumentType } from "@/db/schema";

export type SectionEditorMap = Record<string, ComponentType>;

const cache = new Map<DocumentType, Promise<SectionEditorMap>>();
const resolved = new Map<DocumentType, SectionEditorMap>();

export function peekSectionEditors(
  documentType: DocumentType
): SectionEditorMap | null {
  return resolved.get(documentType) ?? null;
}

export function clearSectionEditorCache() {
  cache.clear();
  resolved.clear();
}

function loadSectionEditorsUncached(
  documentType: DocumentType
): Promise<SectionEditorMap> {
  switch (documentType) {
    case "investigation_report":
      return import("./sections/investigation-section-editors").then(
        (mod) => mod.INVESTIGATION_SECTION_EDITORS
      );
    case "design_verification":
      return import("./sections/dv/dv-section-editors").then(
        (mod) => mod.DV_SECTION_EDITORS
      );
    case "mechanical_design_verification":
      return import("./sections/dv/mechanical-section-editors").then(
        (mod) => mod.MECHANICAL_DV_SECTION_EDITORS
      );
    case "generic_document":
      return import("./sections/generic/generic-document-editor").then(
        (mod) => ({ body: mod.GenericDocumentEditor })
      );
    case "quality_risk_assessment":
      return import("./sections/qra/qra-section-editors").then(
        (mod) => mod.QRA_SECTION_EDITORS
      );
    case "equipment_lifecycle_report":
      return import("./sections/elr/elr-section-editors").then(
        (mod) => mod.ELR_SECTION_EDITORS
      );
    case "vendor_qualification":
      return import("./sections/vq/vq-section-editors").then(
        (mod) => mod.VQ_SECTION_EDITORS
      );
    case "failure_investigation_report":
      return import("./sections/fir/fir-section-editors").then(
        (mod) => mod.FIR_SECTION_EDITORS
      );
    case "qualification_summary_report":
      return import("./sections/qsr/qsr-section-editors").then(
        (mod) => mod.QSR_SECTION_EDITORS
      );
    default: {
      const exhaustive: never = documentType;
      throw new Error(`Unknown document type: ${exhaustive}`);
    }
  }
}

/** Starts the document-type editor chunk. Safe to call from the shell while GET runs. */
export function loadSectionEditors(
  documentType: DocumentType
): Promise<SectionEditorMap> {
  const hit = cache.get(documentType);
  if (hit) return hit;
  const pending = loadSectionEditorsUncached(documentType)
    .then((map) => {
      resolved.set(documentType, map);
      return map;
    })
    .catch((err) => {
      cache.delete(documentType);
      resolved.delete(documentType);
      throw err;
    });
  cache.set(documentType, pending);
  return pending;
}

export function useDocumentSectionEditors(documentType: DocumentType) {
  const [editors, setEditors] = useState<SectionEditorMap | null>(() =>
    peekSectionEditors(documentType)
  );

  useEffect(() => {
    let cancelled = false;
    void loadSectionEditors(documentType).then(
      (map) => {
        if (!cancelled) setEditors(map);
      },
      // ReportWorkspaceLoader owns the retry and the error screen.
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [documentType]);

  return editors;
}
