import type { JSONContent } from "@tiptap/core";
import { emptyDoc } from "@/lib/tiptap/rich-text";
import { seededTableDoc } from "@/lib/document-types/design-verification/sections";
import {
  VQ_FORM,
  VQ_FORM_NO,
  VQ_FORM_REVISION,
  VQ_REQUIRED_SECTION_TITLES,
  type VqChoice,
} from "./schema";

export const VQ_SECTION_KEYS = [
  "vq_cover",
  "vq_section_a",
  "vq_section_b",
  "vq_section_c",
  "vq_section_d",
  "vq_section_e",
  "vq_section_f",
  "vq_section_g",
  "vq_section_h",
  "vq_section_i",
  "vq_section_j",
  "vq_section_k",
  "vq_section_l",
  "vq_section_m",
  "vq_section_n",
  "vq_scoring",
] as const;

export type VqSectionKey = (typeof VQ_SECTION_KEYS)[number];

export type VqAnswers = Record<string, string>;

export type VqSectionContent = {
  answers: VqAnswers;
  narrative?: JSONContent;
  table?: JSONContent;
};

export const VQ_SECTION_LABELS: Record<VqSectionKey, string> = {
  vq_cover: "Cover",
  vq_section_a: `A. ${VQ_REQUIRED_SECTION_TITLES.A}`,
  vq_section_b: `B. ${VQ_REQUIRED_SECTION_TITLES.B}`,
  vq_section_c: `C. ${VQ_REQUIRED_SECTION_TITLES.C}`,
  vq_section_d: `D. ${VQ_REQUIRED_SECTION_TITLES.D}`,
  vq_section_e: `E. ${VQ_REQUIRED_SECTION_TITLES.E}`,
  vq_section_f: `F. ${VQ_REQUIRED_SECTION_TITLES.F}`,
  vq_section_g: `G. ${VQ_REQUIRED_SECTION_TITLES.G}`,
  vq_section_h: `H. ${VQ_REQUIRED_SECTION_TITLES.H}`,
  vq_section_i: `I. ${VQ_REQUIRED_SECTION_TITLES.I}`,
  vq_section_j: `J. ${VQ_REQUIRED_SECTION_TITLES.J}`,
  vq_section_k: `K. ${VQ_REQUIRED_SECTION_TITLES.K}`,
  vq_section_l: `L. ${VQ_REQUIRED_SECTION_TITLES.L}`,
  vq_section_m: `M. ${VQ_REQUIRED_SECTION_TITLES.M}`,
  vq_section_n: `N. ${VQ_REQUIRED_SECTION_TITLES.N}`,
  vq_scoring: "Approval of Vendor Qualification",
};

export const VQ_DEFAULT_METADATA = {
  formNo: VQ_FORM_NO,
  revision: VQ_FORM_REVISION,
  issuedBy: "",
  issuedOn: "",
};

function defaultAnswers(_key: VqSectionKey): VqAnswers {
  return {};
}

function emptyFor(key: VqSectionKey): VqSectionContent {
  const spec = VQ_FORM[key];
  const content: VqSectionContent = { answers: defaultAnswers(key) };
  if (spec?.narrativeLabel) {
    content.narrative = emptyDoc();
  }
  if (spec?.matrix) {
    content.table = seededTableDoc(spec.matrix.headers);
  }
  return content;
}

export const EMPTY_VQ_CONTENT: Record<VqSectionKey, VqSectionContent> =
  Object.fromEntries(
    VQ_SECTION_KEYS.map((key) => [key, emptyFor(key)])
  ) as Record<VqSectionKey, VqSectionContent>;

export function isVqSectionKey(value: string): value is VqSectionKey {
  return (VQ_SECTION_KEYS as readonly string[]).includes(value);
}

export function parseVqChoice(value: string | undefined): VqChoice {
  if (value === "yes" || value === "no" || value === "na") return value;
  return "";
}

export function fieldRefId(fieldId: string): string {
  return `${fieldId}__ref`;
}
