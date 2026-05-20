import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";

export type DefineSection = {
  narrative: JSONContent;
};

export type MeasureSection = {
  narrative: JSONContent;
  regulatoryNotification?: string;
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
    /** Full 5-Why chain and conclusion (single field in the UI). */
    narrative: string;
    /** Legacy second slot; always normalized empty after merge / save. */
    conclusion: string;
  };
  brainstorming: string;
  otherTools: string;
  investigationOutcome: string;
  rootCause: {
    narrative: string;
  };
  impactAssessment: {
    system: string;
    document: string;
    product: string;
    equipment: string;
    patientSafety: string;
  };
};

export type ImproveSection = {
  narrative: JSONContent;
  correctiveActions: string;
};

export type ControlSection = {
  /** All preventive-action and closure content in one free-text field. */
  preventiveActions: string;
};

export type DocumentsReviewedSection = {
  items: string[];
};

export type AttachmentsSection = {
  items: Array<{ label: string; description: string }>;
};

export type SectionContentMap = {
  define: DefineSection;
  measure: MeasureSection;
  analyze: AnalyzeSection;
  improve: ImproveSection;
  control: ControlSection;
  documents_reviewed: DocumentsReviewedSection;
  attachments: AttachmentsSection;
};

export const EMPTY_CONTENT: SectionContentMap = {
  define: {
    narrative: emptyDoc(),
  },
  measure: {
    narrative: emptyDoc(),
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
      narrative: "",
      conclusion: "",
    },
    brainstorming: "",
    otherTools: "",
    investigationOutcome: "",
    rootCause: {
      narrative: "",
    },
    impactAssessment: {
      system: "",
      document: "",
      product: "",
      equipment: "",
      patientSafety: "",
    },
  },
  improve: {
    narrative: emptyDoc(),
    correctiveActions: "",
  },
  control: {
    preventiveActions: "",
  },
  documents_reviewed: {
    items: [],
  },
  attachments: {
    items: [],
  },
};

export const SECTION_LABELS: Record<keyof SectionContentMap, string> = {
  define: "Define",
  measure: "Measure",
  analyze: "Analyze",
  improve: "Improve",
  control: "Control",
  documents_reviewed: "Documents Reviewed",
  attachments: "Attachments",
};

export const EDITABLE_SECTIONS = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
] as const satisfies readonly (keyof SectionContentMap)[];

/** All `report_sections` rows created for a report (DMAIC + document metadata blocks). */
export const REPORT_SECTION_ROW_ORDER = [
  ...EDITABLE_SECTIONS,
  "documents_reviewed",
  "attachments",
] as const satisfies readonly (keyof SectionContentMap)[];

/** Sections rendered as editors in the report workspace (same as DB row order). */
export const REPORT_WORKSPACE_SECTIONS = REPORT_SECTION_ROW_ORDER;
