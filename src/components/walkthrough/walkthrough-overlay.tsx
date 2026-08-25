"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WALKTHROUGH_ATTR, type ProductTourStep } from "@/lib/walkthrough/types";

const CARD_WIDTH = 380;
const CARD_GAP = 14;
const SPOTLIGHT_PAD = 8;

type TargetRect = {
  top: number
  left: number
  width: number
  height: number
};

function readTargetRect(target: string | undefined): TargetRect | null {
  if (!target || typeof document === "undefined") return null;
  const el = document.querySelector(`[${WALKTHROUGH_ATTR}="${target}"]`);
  if (!(el instanceof HTMLElement)) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 && rect.height < 2) return null;
  return {
    top: rect.top - SPOTLIGHT_PAD,
    left: rect.left - SPOTLIGHT_PAD,
    width: rect.width + SPOTLIGHT_PAD * 2,
    height: rect.height + SPOTLIGHT_PAD * 2,
  };
}

function cardPosition(target: TargetRect | null): { top: number; left: number } {
  const width = Math.min(CARD_WIDTH, window.innerWidth - 24);
  const estimatedHeight = 280;
  if (!target) {
    return {
      top: Math.max(12, (window.innerHeight - estimatedHeight) / 2),
      left: Math.max(12, (window.innerWidth - width) / 2),
    };
  }

  const below = target.top + target.height + CARD_GAP;
  const above = target.top - estimatedHeight - CARD_GAP;
  const preferBelow = below + estimatedHeight < window.innerHeight - 12;
  const top = preferBelow
    ? below
    : Math.max(12, above > 12 ? above : target.top);
  let left = target.left;
  left = Math.min(left, window.innerWidth - width - 12);
  left = Math.max(12, left);
  return { top, left };
}

export function WalkthroughOverlay({
  step,
  stepIndex,
  stepCount,
  onNext,
  onBack,
  onSkipForNow,
  onDismissForever,
}: {
  step: ProductTourStep
  stepIndex: number
  stepCount: number
  onNext: () => void
  onBack: () => void
  onSkipForNow: () => void
  onDismissForever: () => void
}) {
  const titleId = useId();
  const descId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [pos, setPos] = useState({ top: 80, left: 24 });
  const isLast = stepIndex >= stepCount - 1;
  const isFirst = stepIndex <= 0;

  const measure = useCallback(() => {
    const rect = readTargetRect(step.target);
    setTargetRect(rect);
    setPos(cardPosition(rect));
  }, [step.target]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 80);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure, step.id]);

  useEffect(() => {
    nextRef.current?.focus();
  }, [step.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onSkipForNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkipForNow]);

  const progressPct = ((stepIndex + 1) / stepCount) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-[80]"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 cursor-default"
        onClick={onSkipForNow}
      />
      {targetRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-lg ring-2 ring-white/90"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            boxShadow: "0 0 0 9999px rgb(15 30 51 / 0.58)",
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[rgb(15_30_51_/_0.58)]"
        />
      )}

      <div
        ref={cardRef}
        className={cn(
          "absolute z-[81] w-[min(380px,calc(100vw-24px))] rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        )}
        style={{ top: pos.top, left: pos.left }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-[var(--secondary)]">
          <div
            className="h-full rounded-full bg-[var(--brand-500)] transition-[width] duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {step.startHere ? "Start here" : "Feature tour"} · {stepIndex + 1} of{" "}
          {stepCount}
        </p>
        <h2 id={titleId} className="mt-1 text-lg font-semibold tracking-tight">
          {step.title}
        </h2>
        <p
          id={descId}
          className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]"
        >
          {step.body}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            disabled={isFirst}
          >
            Back
          </Button>
          <Button ref={nextRef} type="button" size="sm" onClick={onNext}>
            {isLast ? "Done" : isFirst ? "Let's go" : "Next"}
          </Button>
          <button
            type="button"
            className="ml-auto text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
            onClick={onSkipForNow}
          >
            Skip for now
          </button>
        </div>
        <button
          type="button"
          className="mt-3 text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
          onClick={onDismissForever}
        >
          {"Don't show this tour again"}
        </button>
      </div>
    </div>
  );
}
