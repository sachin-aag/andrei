"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ActivityChildNode,
  ActivitySurfaceNode,
} from "@/lib/ai/chat/chat-activity-ui";

function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setSeconds(0);
    const id = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  return seconds;
}

function toneClass(tone: ActivitySurfaceNode["tone"]): string {
  switch (tone) {
    case "success":
      return "chat-activity-success";
    case "warn":
      return "chat-activity-warn";
    default:
      return "text-[var(--muted-foreground)]";
  }
}

function ActivityChildRow({
  child,
  nested = false,
}: {
  child: ActivityChildNode;
  nested?: boolean;
}) {
  if (child.kind === "thought") {
    return (
      <div className={cn("space-y-1", nested && "pl-3")}>
        <div className="text-[11px] font-medium text-[var(--muted-foreground)]">
          {child.pending ? "Thinking…" : "Thought"}
        </div>
        {child.text ? (
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--muted-foreground)]">
            {child.text}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "text-[11px] text-[var(--muted-foreground)]",
        nested && "pl-3"
      )}
    >
      <span>{child.label}</span>
      {child.detail ? (
        <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-[var(--muted-foreground)]/90">
          {child.detail}
        </p>
      ) : null}
    </div>
  );
}

export function ChatActivityLine({
  node,
  defaultExpanded = false,
}: {
  node: ActivitySurfaceNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const elapsed = useElapsedSeconds(node.pending && node.kind === "thought");
  const showChevron = node.expandable && node.children.length > 0;
  const active = node.pending;

  const label =
    node.kind === "thought" && node.pending && elapsed > 0
      ? `Thought ${elapsed}s`
      : node.label;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => {
          if (!showChevron && !node.thoughtText) return;
          setExpanded((value) => !value);
        }}
        disabled={!showChevron && !node.thoughtText}
        className={cn(
          "chat-activity-line group flex w-full items-center gap-1 text-left text-[11px] leading-snug",
          toneClass(node.tone),
          (showChevron || node.thoughtText) && "cursor-pointer hover:text-[var(--foreground)]",
          !showChevron && !node.thoughtText && "cursor-default"
        )}
        aria-expanded={expanded}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            active && "chat-activity-glimmer"
          )}
        >
          {label}
        </span>
        {showChevron ? (
          expanded ? (
            <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden="true" />
          )
        ) : null}
      </button>
      {expanded ? (
        <div className="space-y-1.5 border-l border-[var(--border)] pl-2">
          {node.kind === "thought" && node.thoughtText ? (
            <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--muted-foreground)]">
              {node.thoughtText}
            </p>
          ) : null}
          {node.children.map((child, index) => (
            <ActivityChildRow key={index} child={child} nested />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChatActivityLines({
  nodes,
}: {
  nodes: readonly ActivitySurfaceNode[];
}) {
  return (
    <div className="space-y-1">
      {nodes.map((node, index) => (
        <ChatActivityLine key={`${node.kind}-${index}`} node={node} />
      ))}
    </div>
  );
}

export function ChatActivityDetailList({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="space-y-1 border-l border-[var(--border)] pl-2">
      {children}
    </div>
  );
}
