import {
  getCustomerPack,
  isDocumentTemplatesEnabled,
  type CustomerPack,
} from "@/lib/customers/packs";
import {
  demoTemplateById,
  type DemoDocumentTemplate,
} from "./demo-catalog";

export { isDocumentTemplatesEnabled } from "@/lib/customers/packs";

export {
  BLANK_DOCUMENT_TEMPLATE,
  DEMO_DOCUMENT_TEMPLATES,
  DEMO_TEMPLATE_SECTION_IDS,
  DEMO_TEMPLATE_SECTIONS,
  demoTemplateById,
  demoTemplateMetadata,
  demoTemplateTitleFromMetadata,
  listedDemoTemplates,
  listedDemoTemplatesInSection,
  templatePreviewLines,
  type DemoDocumentTemplate,
  type DemoTemplateMetadata,
  type DemoTemplateSection,
  type DemoTemplateSectionId,
} from "./demo-catalog";

/**
 * Resolve a catalog template only when this pack shows the gallery.
 * Unknown ids and other packs return undefined.
 */
export function resolveEnabledDemoTemplate(
  id: string,
  pack: CustomerPack = getCustomerPack()
): DemoDocumentTemplate | undefined {
  if (!isDocumentTemplatesEnabled(pack)) return undefined;
  return demoTemplateById(id);
}
