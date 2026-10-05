"use client";

import type { ComponentType } from "react";
import { DefineEditor } from "./define-editor";
import { MeasureEditor } from "./measure-editor";
import { AnalyzeEditor } from "./analyze-editor";
import { ImproveEditor } from "./improve-editor";
import { ControlEditor } from "./control-editor";
import { ConclusionEditor } from "./conclusion-editor";
import { DocumentsReviewedEditor } from "./documents-reviewed-editor";
import { AttachmentsEditor } from "./attachments-editor";
import { SignatureApprovalsSection } from "./signature-approvals-section";

export const INVESTIGATION_SECTION_EDITORS: Record<string, ComponentType> = {
  define: DefineEditor,
  measure: MeasureEditor,
  analyze: AnalyzeEditor,
  improve: ImproveEditor,
  control: ControlEditor,
  conclusion: ConclusionEditor,
  documents_reviewed: DocumentsReviewedEditor,
  attachments: AttachmentsEditor,
  signature_approvals: SignatureApprovalsSection,
};
