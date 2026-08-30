import type { ProductTourStatus } from "@/db/schema";
import type { UserRole } from "@/lib/auth/roles";

/** Bump when step ids change so older saved ids can be remapped. */
export const PRODUCT_TOUR_VERSION = 1;

export const WALKTHROUGH_ATTR = "data-walkthrough";

export type { ProductTourStatus };

export type ProductTourStep = {
  id: string
  title: string
  body: string
  /** Getting-started path — shown first and badged in the card. */
  startHere?: boolean
  /** Navigate here when the step becomes active. */
  href?: string
  /** True when the current pathname is the right page for this step. */
  match?: (pathname: string) => boolean
  /** Value of `data-walkthrough`. Omit for a centered card. */
  target?: string
};

export type ProductTourProgress = {
  status: ProductTourStatus
  stepId: string | null
};

export type ProductTourCopyContext = {
  productName: string
  documentTypeLabels: string[]
};

export type WalkthroughRole = UserRole;
