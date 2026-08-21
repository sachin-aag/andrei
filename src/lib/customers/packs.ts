import type { DocumentType } from "@/db/schema";
import {
  COMMON_EVALUATION_SYSTEM_PROMPT,
  PROMPT_VERSION,
} from "@/lib/ai/section-prompts";
import { MJ_CRITERION_DESCRIPTION_OVERRIDES } from "./mj/criterion-overrides";
import {
  MJ_EVALUATION_SYSTEM_PROMPT,
  MJ_PROMPT_VERSION,
  MJ_SECTION_PROMPT_ADDITIONS,
} from "./mj/prompts";
import { resolveCustomerId, type CustomerId } from "./resolve";

export type LogoLayout = "icon" | "wordmark";

export type CustomerBranding = {
  productName: string;
  productNameShort: string;
  documentReviewTitle: string;
  documentReviewDescription: string;
  tagline: string;
  shellTagline: string;
  logoSrc: string;
  logoWhiteSrc: string;
  /** Icon-only mark for collapsed chrome; same as `logoSrc` for square logos. */
  logoMarkSrc: string;
  logoAlt: string;
  /** `wordmark` is a wide lockup (Convergent); `icon` is a square mark. */
  logoLayout: LogoLayout;
  heroLogoSrc: string;
  heroLogoOnWhite: boolean;
  auditExportTitle: string;
  passwordResetSubject: string;
  loginHeadline: string;
  loginSubhead: string;
  loginFooter: string;
  aiAttribution: string;
};

export type CustomerPack = {
  id: CustomerId;
  enabledDocumentTypes: readonly DocumentType[];
  hiddenInvestigationSections: readonly string[];
  investigationTemplateFile: string;
  promptVersion: string;
  evaluationSystemPrompt: string;
  evaluationSectionPromptAdditions: Readonly<Record<string, string>>;
  criterionDescriptionOverrides: Readonly<Record<string, string>>;
  wordImportEnabled: boolean;
  branding: CustomerBranding;
};

const ANDREI_BRANDING: CustomerBranding = {
  productName: "Andrei",
  productNameShort: "Andrei",
  documentReviewTitle: "Andrei — Document Review",
  documentReviewDescription:
    "AI document review and drafting for regulated quality teams",
  tagline: "Quality Documentation",
  shellTagline: "Quality Documentation",
  logoSrc: "/logo.png",
  logoWhiteSrc: "/logo-white.png",
  logoMarkSrc: "/logo.png",
  logoAlt: "Andrei logo",
  logoLayout: "icon",
  heroLogoSrc: "/logo-white.png",
  heroLogoOnWhite: false,
  auditExportTitle: "Andrei — Audit Trail Export",
  passwordResetSubject: "Reset your password — Andrei",
  loginHeadline: "Document review and drafting,\naccelerated.",
  loginSubhead:
    "Draft investigation reports with AI-assisted quality checks, streamlined manager review, and one-click DOCX export.",
  loginFooter: "Better documents. Better outcomes.",
  aiAttribution: "by Andrei",
};

const CONVERGENT_BRANDING: CustomerBranding = {
  productName: "Convergent Dental",
  productNameShort: "Convergent",
  documentReviewTitle: "Convergent Dental — Design Verification",
  documentReviewDescription:
    "AI document review and drafting for Convergent Dental design verification",
  tagline: "Solea® Design Verification",
  shellTagline: "Design Verification",
  logoSrc: "/logo-convergent.png",
  logoWhiteSrc: "/logo-convergent-white.png",
  logoMarkSrc: "/logo-convergent-mark.svg",
  logoAlt: "Convergent Dental logo",
  logoLayout: "wordmark",
  heroLogoSrc: "/logo-convergent.png",
  heroLogoOnWhite: true,
  auditExportTitle: "Convergent Dental — Audit Trail Export",
  passwordResetSubject: "Reset your password — Convergent Dental",
  loginHeadline: "Design verification,\naccelerated.",
  loginSubhead:
    "Draft Solea design verification reports with AI-assisted quality checks, streamlined manager review, and one-click DOCX export.",
  loginFooter: "Andrei Health",
  aiAttribution: "by Andrei",
};

const MJ_BRANDING: CustomerBranding = {
  productName: "M.J. Biopharm Private Limited",
  productNameShort: "M.J. Biopharm",
  documentReviewTitle: "MJ Biopharm - Investigation Report",
  documentReviewDescription:
    "Quality engineering investigation report tool for M.J. Biopharm Private Limited",
  tagline: "Drug Product · Hinjawadi",
  shellTagline: "Quality Investigations",
  logoSrc: "/logo-mj.png",
  logoWhiteSrc: "/logo-mj.png",
  logoMarkSrc: "/logo-mj.png",
  logoAlt: "MJ Biopharm logo",
  logoLayout: "icon",
  heroLogoSrc: "/logo-mj.png",
  heroLogoOnWhite: true,
  auditExportTitle: "M.J. Biopharm — Audit Trail Export",
  passwordResetSubject: "Reset your password — M.J. Biopharm",
  loginHeadline: "Investigation Reporting,\naccelerated.",
  loginSubhead:
    "Draft DMAIC deviation reports with AI-assisted quality checks, streamlined manager review, and one-click DOCX export matching SOP/DP/QA/008.",
  loginFooter: "Ref. SOP No.: SOP/DP/QA/008",
  aiAttribution: "by Andrei",
};

/** Demo pack is the default engine overlay (Andrei branding). */
export const DEMO_PACK: CustomerPack = {
  id: "demo",
  enabledDocumentTypes: ["investigation_report", "design_verification"],
  hiddenInvestigationSections: [],
  investigationTemplateFile: "investigation-report-template.docx",
  promptVersion: PROMPT_VERSION,
  evaluationSystemPrompt: COMMON_EVALUATION_SYSTEM_PROMPT,
  evaluationSectionPromptAdditions: {},
  criterionDescriptionOverrides: {},
  wordImportEnabled: false,
  branding: ANDREI_BRANDING,
};

export const CONVERGENT_PROMPT_VERSION = "convergent-dv-v5";

export const CONVERGENT_PACK: CustomerPack = {
  id: "convergent",
  enabledDocumentTypes: ["design_verification"],
  hiddenInvestigationSections: [],
  investigationTemplateFile: "investigation-report-template.docx",
  promptVersion: CONVERGENT_PROMPT_VERSION,
  evaluationSystemPrompt: COMMON_EVALUATION_SYSTEM_PROMPT,
  evaluationSectionPromptAdditions: {},
  criterionDescriptionOverrides: {},
  wordImportEnabled: false,
  branding: CONVERGENT_BRANDING,
};

export const MJ_PACK: CustomerPack = {
  id: "mj",
  enabledDocumentTypes: ["investigation_report"],
  hiddenInvestigationSections: ["conclusion"],
  investigationTemplateFile: "mj-investigation-report-template.docx",
  promptVersion: MJ_PROMPT_VERSION,
  evaluationSystemPrompt: MJ_EVALUATION_SYSTEM_PROMPT,
  evaluationSectionPromptAdditions: MJ_SECTION_PROMPT_ADDITIONS,
  criterionDescriptionOverrides: MJ_CRITERION_DESCRIPTION_OVERRIDES,
  wordImportEnabled: true,
  branding: MJ_BRANDING,
};

export function getCustomerPack(id: CustomerId = resolveCustomerId()): CustomerPack {
  switch (id) {
    case "demo":
      return DEMO_PACK;
    case "mj":
      return MJ_PACK;
    case "convergent":
      return CONVERGENT_PACK;
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}

export function isDocumentTypeEnabled(
  type: DocumentType,
  pack: CustomerPack = getCustomerPack()
): boolean {
  return pack.enabledDocumentTypes.includes(type);
}
