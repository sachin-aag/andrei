import type { DocumentType } from "@/db/schema";
import {
  COMMON_EVALUATION_SYSTEM_PROMPT,
  PROMPT_VERSION,
} from "@/lib/ai/section-prompts";
import { resolveCustomerId, type CustomerId } from "./resolve";

export type CustomerBranding = {
  productName: string;
  documentReviewTitle: string;
  tagline: string;
  logoSrc: string;
  logoWhiteSrc: string;
  logoAlt: string;
  auditExportTitle: string;
  passwordResetSubject: string;
};

export type CustomerPack = {
  id: CustomerId;
  enabledDocumentTypes: readonly DocumentType[];
  hiddenInvestigationSections: readonly string[];
  investigationTemplateFile: string;
  promptVersion: string;
  evaluationSystemPrompt: string;
  criterionDescriptionOverrides: Readonly<Record<string, string>>;
  wordImportEnabled: boolean;
  branding: CustomerBranding;
};

const ANDREI_BRANDING: CustomerBranding = {
  productName: "Andrei",
  documentReviewTitle: "Andrei — Document Review",
  tagline: "Quality Documentation",
  logoSrc: "/logo.png",
  logoWhiteSrc: "/logo-white.png",
  logoAlt: "Andrei logo",
  auditExportTitle: "Andrei — Audit Trail Export",
  passwordResetSubject: "Reset your password — Andrei",
};

/**
 * Demo pack matches current feat/whitelabel behavior. The MJ pack starts as a
 * copy so ANDREI_CUSTOMER=mj is a no-op until the content overlay lands.
 */
export const DEMO_PACK: CustomerPack = {
  id: "demo",
  enabledDocumentTypes: ["investigation_report", "design_verification"],
  hiddenInvestigationSections: [],
  investigationTemplateFile: "investigation-report-template.docx",
  promptVersion: PROMPT_VERSION,
  evaluationSystemPrompt: COMMON_EVALUATION_SYSTEM_PROMPT,
  criterionDescriptionOverrides: {},
  wordImportEnabled: false,
  branding: ANDREI_BRANDING,
};

export const MJ_PACK: CustomerPack = {
  ...DEMO_PACK,
  id: "mj",
};

export function getCustomerPack(id: CustomerId = resolveCustomerId()): CustomerPack {
  switch (id) {
    case "demo":
      return DEMO_PACK;
    case "mj":
      return MJ_PACK;
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
