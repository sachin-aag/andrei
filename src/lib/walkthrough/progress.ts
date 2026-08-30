import { z } from "zod";
import type { ProductTourStatus } from "@/db/schema";
import type { ProductTourProgress } from "@/lib/walkthrough/types";

export const PRODUCT_TOUR_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "dismissed",
] as const satisfies readonly ProductTourStatus[];

export const productTourProgressSchema = z.object({
  status: z.enum(PRODUCT_TOUR_STATUSES),
  stepId: z.string().min(1).max(64).nullable(),
});

export type ProductTourProgressInput = z.infer<typeof productTourProgressSchema>;

export function normalizeProductTourProgress(row: {
  productTourStatus: ProductTourStatus
  productTourStepId: string | null
}): ProductTourProgress {
  return {
    status: row.productTourStatus,
    stepId: row.productTourStepId,
  };
}

/** Completed or dismissed tours stay closed until the user replays from Profile. */
export function shouldShowProductTour(status: ProductTourStatus): boolean {
  return status === "not_started" || status === "in_progress";
}

/** sessionStorage key for Skip for now. Value is scoped to the auth session. */
export const PRODUCT_TOUR_SESSION_PAUSE_KEY = "andrei:product-tour:paused";

export function productTourSessionKeyFromAuth(
  session:
    | { expires?: string; productTourSessionId?: string }
    | null
    | undefined
): string {
  if (
    typeof session?.productTourSessionId === "string" &&
    session.productTourSessionId.length > 0
  ) {
    return session.productTourSessionId;
  }
  return typeof session?.expires === "string" && session.expires.length > 0
    ? session.expires
    : "";
}

export function productTourPauseToken(userId: string, sessionKey: string): string {
  return `${userId}:${sessionKey}`;
}

/**
 * Skip for now lasts this browser tab until the user logs in again.
 * A new auth session (new `session.expires`) must not stay paused.
 */
export function isProductTourPausedForSession(
  stored: string | null,
  userId: string,
  sessionKey: string
): boolean {
  if (!stored || !sessionKey) return false;
  return stored === productTourPauseToken(userId, sessionKey);
}
