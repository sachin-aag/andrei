export type DefineSection = {
  narrative: string;
  location?: string;
  dateTimeOccurrence?: string;
  dateTimeDetection?: string;
  personnel?: string;
  initialScope?: string;
};

export type MeasureSection = {
  narrative: string;
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
    whys: FiveWhyEntry[];
    conclusion: string;
  };
  brainstorming: string;
  otherTools: string;
  investigationOutcome: string;
  rootCause: {
    narrative: string;
    primaryLevel1: string;
    secondaryLevel2: string;
    thirdLevel3: string;
  };
  impactAssessment: {
    system: string;
    document: string;
    product: string;
    equipment: string;
    patientSafety: string;
  };
};

export type CorrectiveAction = {
  id: string;
  description: string;
  responsiblePerson: string;
  dueDate: string;
  expectedOutcome: string;
  effectivenessVerification: string;
};

export type ImproveSection = {
  narrative: string;
  correctiveActions: CorrectiveAction[];
};

export type PreventiveAction = {
  id: string;
  description: string;
  responsiblePerson: string;
  dueDate: string;
  expectedOutcome: string;
  effectivenessVerification: string;
  linkedRootCause: string;
};

export type ControlSection = {
  narrative: string;
  preventiveActions: PreventiveAction[];
  interimPlan: string;
  finalComments: string;
  regulatoryImpact: string;
  productQuality: string;
  validation: string;
  stability: string;
  marketClinical: string;
  lotDisposition: string;
  conclusion: string;
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
    narrative: "",
    location: "",
    dateTimeOccurrence: "",
    dateTimeDetection: "",
    personnel: "",
    initialScope: "",
  },
  measure: {
    narrative: "",
    regulatoryNotification: "",
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
      whys: [
        { question: "", answer: "" },
        { question: "", answer: "" },
        { question: "", answer: "" },
        { question: "", answer: "" },
        { question: "", answer: "" },
      ],
      conclusion: "",
    },
    brainstorming: "",
    otherTools: "",
    investigationOutcome: "",
    rootCause: {
      narrative: "",
      primaryLevel1: "",
      secondaryLevel2: "",
      thirdLevel3: "",
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
    narrative: "",
    correctiveActions: [],
  },
  control: {
    narrative: "",
    preventiveActions: [],
    interimPlan: "",
    finalComments: "",
    regulatoryImpact: "",
    productQuality: "",
    validation: "",
    stability: "",
    marketClinical: "",
    lotDisposition: "",
    conclusion: "",
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

export const EDITABLE_SECTIONS: Array<keyof SectionContentMap> = [
  "define",
  "measure",
  "analyze",
  "improve",
  "control",
];
