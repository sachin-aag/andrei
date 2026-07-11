import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";

export type DefineSection = {
  narrative: JSONContent;
};

export type MeasureSection = {
  narrative: JSONContent;
  regulatoryNotification?: string;
  experimentNumber?: string;
  experimentTitle?: string;
  purpose?: JSONContent;
  conclusion?: JSONContent;
};

export type FiveWhyEntry = {
  question: string;
  answer: string;
};

export type AnalyzeSection = {
  sixM: {
    man: string;
    machine: string;
    measurement: string;
    material: string;
    method: string;
    milieu: string;
    conclusion: string;
  };
  fiveWhy: {
    /** Full 5-Why chain and conclusion (single rich field in the UI). */
    narrative: JSONContent;
    /** Legacy second slot; always normalized empty after merge / save. */
    conclusion: string;
  };
  brainstorming: string;
  otherTools: string;
  investigationOutcome: JSONContent;
  rootCause: {
    narrative: JSONContent;
  };
  /** System/Document/Product/Equipment/Patient safety — single rich block. */
  impactAssessment: JSONContent;
};

export type ImproveSection = {
  narrative: JSONContent;
  correctiveActions: JSONContent;
};

export type ControlSection = {
  /** All preventive-action and closure content in one rich field. */
  preventiveActions: JSONContent;
};

export type ConclusionSection = {
  narrative: JSONContent;
};

export type DocumentsReviewedSection = {
  items: string[];
};

export type AttachmentsSection = {
  items: Array<{ label: string; description: string }>;
};

/** Bottom QC/QA sign-off table (imported from uploaded DOCX; read-only in the app). */
export type SignatureApprovalsSection = {
  table: JSONContent | null;
  headerRowXml?: string;
  dataRowXml?: string;
};

export type SectionContentMap = {
  define: DefineSection;
  measure: MeasureSection;
  analyze: AnalyzeSection;
  improve: ImproveSection;
  control: ControlSection;
  conclusion: ConclusionSection;
  documents_reviewed: DocumentsReviewedSection;
  attachments: AttachmentsSection;
  signature_approvals: SignatureApprovalsSection;
};

export const EMPTY_CONTENT: SectionContentMap = {
  define: {
    narrative: emptyDoc(),
  },
  measure: {
    narrative: emptyDoc(),
    experimentNumber: "",
    experimentTitle: "",
    purpose: emptyDoc(),
    conclusion: emptyDoc(),
  },
  analyze: {
    sixM: {
      man: "",
      machine: "",
      measurement: "",
      material: "",
      method: "",
      milieu: "",
      conclusion: "",
    },
    fiveWhy: {
      narrative: emptyDoc(),
      conclusion: "",
    },
    brainstorming: "",
    otherTools: "",
    investigationOutcome: emptyDoc(),
    rootCause: {
      narrative: emptyDoc(),
    },
    impactAssessment: emptyDoc(),
  },
  improve: {
    narrative: emptyDoc(),
    correctiveActions: emptyDoc(),
  },
  control: {
    preventiveActions: emptyDoc(),
  },
  conclusion: {
    narrative: emptyDoc(),
  },
  documents_reviewed: {
    items: [],
  },
  attachments: {
    items: [],
  },
  signature_approvals: {
    table: null,
  },
};

export const SECTION_LABELS: Record<keyof SectionContentMap, string> = {
  define: "Define",
  measure: "Measure",
  analyze: "Analyze",
  improve: "Improve",
  control: "Control",
  conclusion: "Conclusion",
  documents_reviewed: "Documents Reviewed",
  attachments: "Attachments",
  signature_approvals: "Approvals (QC / QA)",
};

export const EDITABLE_SECTIONS = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
  "conclusion",
] as const satisfies readonly (keyof SectionContentMap)[];

/** All `report_sections` rows created for a report (DMAIC + document metadata blocks). */
export const REPORT_SECTION_ROW_ORDER = [
  ...EDITABLE_SECTIONS,
  "documents_reviewed",
  "attachments",
  "signature_approvals",
] as const satisfies readonly (keyof SectionContentMap)[];

/** Sections rendered as editors in the report workspace (same as DB row order). */
export const REPORT_WORKSPACE_SECTIONS = REPORT_SECTION_ROW_ORDER;
