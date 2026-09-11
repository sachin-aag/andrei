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
import {
  productTourStepIsOnPage,
  resolveStepIndex,
  resumeTourIndexForPathname,
  stepsForRole,
} from "@/lib/walkthrough/steps";
import { shouldShowProductTour } from "@/lib/walkthrough/progress";
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
  role,
  children,
}: {
  role: UserRole
  children: ReactNode
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [progress, setProgress] = useState<ProductTourProgress | null>(null);
  const [index, setIndex] = useState(0);
  const persistSeq = useRef(0);
  const startedRef = useRef(false);
  const navigatedForStepRef = useRef<string | null>(null);

  const copy = useMemo(() => {
    const pack = getCustomerPack();
    return {
      productName: pack.branding.productNameShort,
      documentTypeLabels: listDocumentTypes().map((type) => type.label),
      insightsEnabled: pack.insightsEnabled,
      statisticalAnalysisEnabled: pack.statisticalAnalysisEnabled,
    };
  }, []);

  const steps = useMemo(() => stepsForRole(role, copy), [role, copy]);
  const resumedIndex = resumeTourIndexForPathname(steps, index, pathname);
  if (resumedIndex !== index) {
    setIndex(resumedIndex);
  }
  const step: ProductTourStep | undefined = steps[resumedIndex];
  const stepOnPage = Boolean(step && productTourStepIsOnPage(step, pathname));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/walkthrough", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as ProductTourProgress;
        if (cancelled) return;
        // Replay (or any persist) can beat this GET. Do not clobber local progress.
        if (persistSeq.current === 0) {
          setProgress({ status: data.status, stepId: data.stepId });
          setIndex(resolveStepIndex(steps, data.stepId));
        }
      } catch {
        // Fail closed — do not block the app if progress cannot be loaded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [steps]);

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

  const tourActive =
    progress !== null &&
    shouldShowProductTour(progress.status) &&
    Boolean(step);
  const visible = tourActive && stepOnPage;

  useEffect(() => {
    if (!visible || !step) return;
    if (progress?.status !== "not_started" || startedRef.current) return;
    startedRef.current = true;
    captureEvent("product_tour_started", { role });
    void persist({ status: "in_progress", stepId: step.id });
  }, [visible, step, progress?.status, persist, role]);

  useEffect(() => {
    if (!tourActive || !step) return;
    if (progress?.status !== "in_progress") return;
    if (progress.stepId === step.id) return;
    // Keep saved progress on the card the user just opened a page for.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- persist() updates progress after a route change
    void persist({ status: "in_progress", stepId: step.id });
  }, [tourActive, step, progress?.status, progress?.stepId, persist]);

  useEffect(() => {
    if (!tourActive || !step?.href || !step.match) return;
    if (step.match(pathname)) {
      navigatedForStepRef.current = null;
      return;
    }
    if (navigatedForStepRef.current === step.id) return;
    navigatedForStepRef.current = step.id;
    router.push(step.href);
  }, [tourActive, step, pathname, router]);

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

  const restart = useCallback(() => {
    startedRef.current = false;
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
          onDismissForever={dismissForever}
        />
      ) : null}
    </WalkthroughContext>
  );
}
