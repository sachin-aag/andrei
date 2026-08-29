"use client";

import { useCallback, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import {
  WORKSPACE_RESIZE_LARGE_STEP_PX,
  WORKSPACE_RESIZE_STEP_PX,
  clamp,
} from "@/components/report/workspace-layout";

type Props = {
  label: string;
  controlsId?: string;
  /** `start` = handle on the panel's left edge (chat, or the Agent document column). `end` = right edge (documents). */
  edge: "start" | "end";
  value: number;
  min: number;
  max: number;
  onChange: (width: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onReset?: () => void;
};

export function WorkspaceResizeHandle({
  label,
  controlsId,
  edge,
  value,
  min,
  max,
  onChange,
  onDragStart,
  onDragEnd,
  onReset,
}: Props) {
  const applyDelta = useCallback(
    (delta: number) => {
      onChange(clamp(Math.round(value + delta), min, max));
    },
    [max, min, onChange, value]
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const originX = event.clientX;
    const originWidth = value;
    const invert = edge === "start";

    handle.setPointerCapture(pointerId);
    onDragStart?.();

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - originX;
      const next = originWidth + (invert ? -delta : delta);
      onChange(clamp(Math.round(next), min, max));
    };

    const stop = () => {
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
      onDragEnd?.();
    };

    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey
      ? WORKSPACE_RESIZE_LARGE_STEP_PX
      : WORKSPACE_RESIZE_STEP_PX;
    const invert = edge === "start" ? -1 : 1;

    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        applyDelta(-step * invert);
        return;
      case "ArrowRight":
        event.preventDefault();
        applyDelta(step * invert);
        return;
      case "Home":
        event.preventDefault();
        onChange(min);
        return;
      case "End":
        event.preventDefault();
        onChange(max);
        return;
      default:
        return;
    }
  };

  return (
    <div
      role="separator"
      aria-label={label}
      aria-controls={controlsId}
      aria-orientation="vertical"
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      title="Drag to resize. Double-click to reset."
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      className={cn(
        "absolute inset-y-0 z-20 w-3 cursor-col-resize touch-none",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
        "group/handle",
        edge === "start" ? "-left-1.5" : "-right-1.5"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent",
          "transition-colors group-hover/handle:bg-[var(--brand-400)] group-focus-visible/handle:bg-[var(--brand-400)]",
          "group-active/handle:bg-[var(--brand-500)]"
        )}
      />
    </div>
  );
}
