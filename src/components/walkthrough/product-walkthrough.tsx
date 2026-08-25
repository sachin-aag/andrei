"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { UserRole } from "@/lib/auth/roles";
import { captureEvent } from "@/lib/analytics/events";
import { getCustomerPack } from "@/lib/customers/packs";
import { listDocumentTypes } from "@/lib/document-types";
import { resolveStepIndex, stepsForRole } from "@/lib/walkthrough/steps";
import {
  isProductTourPausedForSession,
  PRODUCT_TOUR_SESSION_PAUSE_KEY,
  productTourPauseToken,
  shouldShowProductTour,
} from "@/lib/walkthrough/progress";
import type {
  ProductTourProgress,
  ProductTourStep,
} from "@/lib/walkthrough/types";
import { WalkthroughOverlay } from "@/components/walkthrough/walkthrough-overlay";

type WalkthroughContextValue = {
  restart: () => void
  canReplay: boolean
};

const WalkthroughContext = createContext<WalkthroughContextValue | null>(null);

export function useProductWalkthrough(): WalkthroughContextValue {
  const value = use(WalkthroughContext);
  if (!value) {
    return { restart: () => undefined, canReplay: false };
  }
  return value;
}

export function ProductWalkthroughProvider({
  userId,
  role,
  children,
}: {
  userId: string
  role: UserRole
  children: ReactNode
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [progress, setProgress] = useState<ProductTourProgress | null>(null);
  const [sessionKey, setSessionKey] = useState("");
  const [pausedThisSession, setPausedThisSession] = useState(false);
  const [sessionPauseReady, setSessionPauseReady] = useState(false);
  const [index, setIndex] = useState(0);
  const persistSeq = useRef(0);
  const startedRef = useRef(false);

  const copy = useMemo(() => {
    const pack = getCustomerPack();
    return {
      productName: pack.branding.productNameShort,
      documentTypeLabels: listDocumentTypes().map((type) => type.label),
    };
  }, []);

  const steps = useMemo(() => stepsForRole(role, copy), [role, copy]);
  const step: ProductTourStep | undefined = steps[index];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/walkthrough", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as ProductTourProgress & {
          sessionKey?: string
        };
        if (cancelled) return;
        const nextSessionKey =
          typeof data.sessionKey === "string" ? data.sessionKey : "";
        setProgress({ status: data.status, stepId: data.stepId });
        setSessionKey(nextSessionKey);
        setIndex(resolveStepIndex(steps, data.stepId));
        try {
          setPausedThisSession(
            isProductTourPausedForSession(
              sessionStorage.getItem(PRODUCT_TOUR_SESSION_PAUSE_KEY),
              userId,
              nextSessionKey
            )
          );
        } catch {
          setPausedThisSession(false);
        }
        setSessionPauseReady(true);
      } catch {
        // Fail closed — do not block the app if progress cannot be loaded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [steps, userId]);

  const persist = useCallback(async (next: ProductTourProgress) => {
    const seq = ++persistSeq.current;
    setProgress(next);
    try {
      await fetch("/api/me/walkthrough", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
        keepalive: true,
      });
      if (seq !== persistSeq.current) return;
    } catch {
      // Keep optimistic UI; next login will re-fetch.
    }
  }, []);

  const visible =
    sessionPauseReady &&
    progress !== null &&
    shouldShowProductTour(progress.status) &&
    !pausedThisSession &&
    Boolean(step);

  useEffect(() => {
    if (!visible || !step) return;
    if (progress?.status !== "not_started" || startedRef.current) return;
    startedRef.current = true;
    captureEvent("product_tour_started", { role });
    void persist({ status: "in_progress", stepId: step.id });
  }, [visible, step, progress?.status, persist, role]);

  useEffect(() => {
    if (!visible || !step) return;
    if (!step.href || !step.match) return;
    if (step.match(pathname)) return;
    router.push(step.href);
  }, [visible, step, pathname, router]);

  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(nextIndex, steps.length - 1));
      const nextStep = steps[clamped];
      if (!nextStep) return;
      setIndex(clamped);
      void persist({ status: "in_progress", stepId: nextStep.id });
    },
    [persist, steps]
  );

  const complete = useCallback(() => {
    void persist({ status: "completed", stepId: "done" });
    captureEvent("product_tour_completed", { role });
  }, [persist, role]);

  const dismissForever = useCallback(() => {
    void persist({ status: "dismissed", stepId: step?.id ?? null });
    captureEvent("product_tour_dismissed", { role, stepId: step?.id });
  }, [persist, role, step?.id]);

  const skipForNow = useCallback(() => {
    try {
      sessionStorage.setItem(
        PRODUCT_TOUR_SESSION_PAUSE_KEY,
        productTourPauseToken(userId, sessionKey)
      );
    } catch {
      // Private mode can throw; in-memory pause still applies.
    }
    setPausedThisSession(true);
    if (step) {
      void persist({ status: "in_progress", stepId: step.id });
    }
    captureEvent("product_tour_skipped_session", { role, stepId: step?.id });
  }, [persist, role, sessionKey, step, userId]);

  const restart = useCallback(() => {
    try {
      sessionStorage.removeItem(PRODUCT_TOUR_SESSION_PAUSE_KEY);
    } catch {
      // ignore
    }
    startedRef.current = false;
    setPausedThisSession(false);
    setIndex(0);
    const first = steps[0];
    void persist({
      status: "in_progress",
      stepId: first?.id ?? "welcome",
    });
    captureEvent("product_tour_replayed", { role });
  }, [persist, role, steps]);

  const canReplay = progress !== null && !shouldShowProductTour(progress.status);

  const contextValue = useMemo(
    () => ({ restart, canReplay }),
    [restart, canReplay]
  );

  const isLast = index >= steps.length - 1;

  return (
    <WalkthroughContext value={contextValue}>
      {children}
      {visible && step ? (
        <WalkthroughOverlay
          step={step}
          stepIndex={index}
          stepCount={steps.length}
          onNext={() => {
            if (isLast) {
              complete();
              return;
            }
            goTo(index + 1);
          }}
          onBack={() => goTo(index - 1)}
          onSkipForNow={skipForNow}
          onDismissForever={dismissForever}
        />
      ) : null}
    </WalkthroughContext>
  );
}
