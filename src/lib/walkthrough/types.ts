import type { ProductTourStatus } from "@/db/schema";
import type { UserRole } from "@/lib/auth/roles";

/** Bump when step ids change so older saved ids can be remapped. */
export const PRODUCT_TOUR_VERSION = 2;

export const WALKTHROUGH_ATTR = "data-walkthrough";

export type { ProductTourStatus };

export type ProductTourStep = {
  id: string
  title: string
  body: string
  /** Getting-started path — shown first and badged in the card. */
  startHere?: boolean
  /** Navigate here when the step becomes active and the user is not already on `match`. */
  href?: string
  /**
   * Right page for this card. If this returns false, hide the overlay until
   * the user opens that page (or `href` takes them there). Report-only cards
   * must wait for a report — never show them on the dashboard.
   */
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
  insightsEnabled: boolean
  statisticalAnalysisEnabled: boolean
};

export type WalkthroughRole = UserRole;
