import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useReportEditors,
  useReportPlaceholders,
} from "@/providers/report-provider";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import { SectionAccordion, useSectionAccordionState } from "./section-accordion";
import type { Placeholder } from "@/lib/placeholders/find";
import { fillPlaceholder } from "@/lib/placeholders/fill";

/** Try to extract a human-readable field label from placeholder text like `[Batch No.: <to be filled>]` */
function extractLabel(text: string): string {
  // Strip outer brackets
  let inner = text.replace(/^\[/, "").replace(/\]$/, "").trim();
  // Strip `<to be filled>` / `to be filled` suffix
  inner = inner.replace(/<?\s*to be filled\s*>?/gi, "").trim();
  // Strip trailing colon/dash
  inner = inner.replace(/[:\-]+\s*$/, "").trim();
  return inner || text;
}

/* ------------------------------------------------------------------ */
/*  Individual placeholder card                                        */
/* ------------------------------------------------------------------ */

function PlaceholderCard({
  placeholder,
  fillValue,
  onFillValueChange,
  onFill,
  onJump,
  beforeCtx,
  afterCtx,
}: {
  placeholder: Placeholder;
  fillValue: string;
  onFillValueChange: (value: string) => void;
  onFill: () => void;
  onJump: () => void;
  beforeCtx: string;
  afterCtx: string;
}) {
  const label = extractLabel(placeholder.text);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      {/* Header: field label + jump button */}
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/60 border-b border-amber-100">
        <PenLine className="size-3.5 text-amber-600 shrink-0" />
        <span className="flex-1 min-w-0 text-xs font-medium text-amber-800 truncate">
          {label}
        </span>
        <button
          type="button"
          onClick={onJump}
          className="text-[10px] font-medium text-amber-600 hover:text-amber-800 flex items-center gap-0.5 shrink-0 transition-colors"
          title="Jump to placeholder in editor"
        >
          Jump
          <ArrowRight className="size-3" />
        </button>
      </div>

      {/* Context: surrounding text with placeholder highlighted */}
      <div className="px-3 py-2 text-xs text-[var(--muted-foreground)] leading-relaxed">
        {beforeCtx && <span>{beforeCtx}</span>}
        <span className="inline-block px-1 mx-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium">
          {placeholder.text}
        </span>
        {afterCtx && <span>{afterCtx}</span>}
      </div>

      {/* Fill input */}
      <div className="flex items-center gap-2 px-3 pb-2.5">
        <Input
          value={fillValue}
          onChange={(e) => onFillValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onFill();
            }
          }}
          placeholder={"Enter value\u2026"}
          className="h-7 text-xs flex-1"
        />
        <Button
          variant="default"
          size="sm"
          className="h-7 text-xs px-3"
          disabled={!fillValue.trim()}
          onClick={onFill}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}

type ExitingSnapshot = {
  id: string;
  placeholder: Placeholder;
  beforeCtx: string;
  afterCtx: string;
};

const SWIPE_OUT_MS = 320;

/** Renders a frozen snapshot of the card and swipes it out to the right after mount. */
function ExitingPlaceholderCard({
  snapshot,
  onDone,
}: {
  snapshot: ExitingSnapshot;
  onDone: () => void;
}) {
  const { placeholder, beforeCtx, afterCtx } = snapshot;
  const label = extractLabel(placeholder.text);
  const [phase, setPhase] = useState<"enter" | "exit">("enter");
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);

  useLayoutEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  useLayoutEffect(() => {
    const id2Ref = { current: null as number | null };
    const id1 = requestAnimationFrame(() => {
      id2Ref.current = requestAnimationFrame(() => setPhase("exit"));
    });
    const fallback = window.setTimeout(finish, SWIPE_OUT_MS + 120);
    return () => {
      cancelAnimationFrame(id1);
      if (id2Ref.current != null) cancelAnimationFrame(id2Ref.current);
      window.clearTimeout(fallback);
    };
  }, [finish]);

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "transform" && e.propertyName !== "opacity") return;
    finish();
  };

  return (
    <div
      aria-hidden
      className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden pointer-events-none select-none will-change-[transform,opacity]"
      style={{
        transitionProperty: "transform, opacity",
        transitionDuration: `${SWIPE_OUT_MS}ms`,
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        transform:
          phase === "exit"
            ? "translate3d(115%, 0, 0)"
            : "translate3d(0, 0, 0)",
        opacity: phase === "exit" ? 0 : 1,
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/60 border-b border-amber-100">
        <PenLine className="size-3.5 text-amber-600 shrink-0" />
        <span className="flex-1 min-w-0 text-xs font-medium text-amber-800 truncate">
          {label}
        </span>
        <span className="text-[10px] font-medium text-amber-600/70 shrink-0">
          Filled
        </span>
      </div>
      <div className="px-3 py-2 text-xs text-[var(--muted-foreground)] leading-relaxed pb-2.5">
        {beforeCtx && <span>{beforeCtx}</span>}
        <span className="inline-block px-1 mx-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-medium">
          {placeholder.text}
        </span>
        {afterCtx && <span>{afterCtx}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Placeholders panel content                                         */
/* ------------------------------------------------------------------ */

export function PlaceholdersPanelContent({
  onJumpToPlaceholder,
}: {
  onJumpToPlaceholder: (p: Placeholder) => void;
}) {
  const { pendingPlaceholders } = useReportPlaceholders();
  const { getEditor } = useReportEditors();
  const [fillValues, setFillValues] = useState<Record<string, string>>({});
  const [exiting, setExiting] = useState<ExitingSnapshot[]>([]);
  const { openSections, toggle } = useSectionAccordionState();

  const grouped = pendingPlaceholders.reduce(
    (acc, p) => {
      if (!acc[p.section]) acc[p.section] = [];
      acc[p.section].push(p);
      return acc;
    },
    {} as Record<string, Placeholder[]>,
  );

  const handleFill = (p: Placeholder) => {
    const value = fillValues[p.id]?.trim();
    if (!value) return;
    const editor = getEditor(p.section, p.contentPath);
    if (!editor) return;

    let beforeCtx = "";
    let afterCtx = "";
    const doc = editor.state.doc;
    const from = Math.max(0, p.fromPos - 50);
    const to = Math.min(doc.content.size, p.toPos + 50);
    beforeCtx = doc.textBetween(from, p.fromPos, " ");
    afterCtx = doc.textBetween(p.toPos, to, " ");

    const success = fillPlaceholder(editor, p, value);
    if (success) {
      setExiting((prev) => [
        ...prev.filter((x) => x.id !== p.id),
        { id: p.id, placeholder: p, beforeCtx, afterCtx },
      ]);
      setFillValues((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
    }
  };

  if (pendingPlaceholders.length === 0 && exiting.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="size-12 rounded-full bg-green-50 flex items-center justify-center mb-4">
          <CheckCircle2 className="size-6 text-green-600" />
        </div>
        <p className="text-sm font-medium text-[var(--foreground)]">
          You&apos;re all caught up!
        </p>
        <p className="text-xs text-[var(--muted-foreground)] mt-1 max-w-[250px]">
          No placeholders found in the document.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--muted-foreground)] mb-2">
        {pendingPlaceholders.length} placeholder{pendingPlaceholders.length === 1 ? "" : "s"}{" "}
        left to fill.
      </p>
      {EVALUATABLE_SECTIONS.map((section) => {
        const list = grouped[section] ?? [];
        const exitingForSection = exiting.filter(
          (e) => e.placeholder.section === section,
        );
        const sectionCount = list.length + exitingForSection.length;
        return (
          <SectionAccordion
            key={section}
            section={section}
            count={sectionCount}
            isOpen={openSections.has(section)}
            onToggle={() => toggle(section)}
          >
            <div className="space-y-2 overflow-x-hidden">
              {list.map((p) => {
                const editor = getEditor(p.section, p.contentPath);
                let beforeCtx = "";
                let afterCtx = "";
                if (editor) {
                  const doc = editor.state.doc;
                  const from = Math.max(0, p.fromPos - 50);
                  const to = Math.min(doc.content.size, p.toPos + 50);
                  beforeCtx = doc.textBetween(from, p.fromPos, " ");
                  afterCtx = doc.textBetween(p.toPos, to, " ");
                }

                return (
                  <PlaceholderCard
                    key={p.id}
                    placeholder={p}
                    fillValue={fillValues[p.id] ?? ""}
                    onFillValueChange={(v) =>
                      setFillValues((prev) => ({ ...prev, [p.id]: v }))
                    }
                    onFill={() => handleFill(p)}
                    onJump={() => onJumpToPlaceholder(p)}
                    beforeCtx={beforeCtx}
                    afterCtx={afterCtx}
                  />
                );
              })}
              {exitingForSection.map((snap) => (
                <ExitingPlaceholderCard
                  key={`exiting-${snap.id}`}
                  snapshot={snap}
                  onDone={() =>
                    setExiting((prev) => prev.filter((x) => x.id !== snap.id))
                  }
                />
              ))}
            </div>
          </SectionAccordion>
        );
      })}
    </div>
  );
}
