import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";
import {
  CONVERGENT_EQUIPMENT_HEADERS,
  CONVERGENT_RESULTS_HEADERS,
  seededTableDoc,
} from "@/lib/document-types/design-verification/sections";

export const CONVERGENT_DV_SECTION_KEYS = [
  "purpose",
  "scope",
  "testers_dates",
  "methods_of_measurement",
  "test_equipment",
  "deviations",
  "results_and_discussions",
  "problems_resolution",
  "conclusion",
] as const;

export type ConvergentDvSectionKey = (typeof CONVERGENT_DV_SECTION_KEYS)[number];

export type ConvergentNarrativeSection = {
  narrative: JSONContent;
};

export type ConvergentTestersDatesSection = {
  testers: JSONContent;
};

export type ConvergentTableSection = {
  table: JSONContent;
};

export type ConvergentResultsSection = {
  narrative: JSONContent;
  table: JSONContent;
};

export type ConvergentDvSectionMap = {
  purpose: ConvergentNarrativeSection;
  scope: ConvergentNarrativeSection;
  testers_dates: ConvergentTestersDatesSection;
  methods_of_measurement: ConvergentNarrativeSection;
  test_equipment: ConvergentTableSection;
  deviations: ConvergentNarrativeSection;
  results_and_discussions: ConvergentResultsSection;
  problems_resolution: ConvergentNarrativeSection;
  conclusion: ConvergentNarrativeSection;
};

export const CONVERGENT_DV_SECTION_LABELS: Record<ConvergentDvSectionKey, string> =
  {
    purpose: "Purpose",
    scope: "Scope",
    testers_dates: "Testers & Dates",
    methods_of_measurement: "Methods of Measurement",
    test_equipment: "Test Equipment",
    deviations: "Deviations",
    results_and_discussions: "Results and Discussions",
    problems_resolution: "Problems or Failure Resolution",
    conclusion: "Conclusion",
  };

export const EMPTY_CONVERGENT_DV_CONTENT: ConvergentDvSectionMap = {
  purpose: { narrative: emptyDoc() },
  scope: { narrative: emptyDoc() },
  testers_dates: { testers: emptyDoc() },
  methods_of_measurement: { narrative: emptyDoc() },
  test_equipment: { table: seededTableDoc(CONVERGENT_EQUIPMENT_HEADERS) },
  deviations: { narrative: emptyDoc() },
  results_and_discussions: {
    narrative: emptyDoc(),
    table: seededTableDoc(CONVERGENT_RESULTS_HEADERS),
  },
  problems_resolution: { narrative: emptyDoc() },
  conclusion: { narrative: emptyDoc() },
};
