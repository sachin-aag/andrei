"use client";

import {
  BookOpen,
  GitBranch,
  MessageSquare,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@/lib/utils";
import { getCustomerPack } from "@/lib/customers/packs";
import { REVIEW_MOCKUP_DOCUMENT, type ReviewMockupTab } from "@/lib/review-mockup/sample-data";
import { useReviewMockup } from "./review-mockup-state";
import { AgentsPanel } from "./review-mockup-agents";
import { AssistantPanel } from "./review-mockup-assistant";
import { PlaybooksPanel } from "./review-mockup-playbooks";
import { SkillsPanel } from "./review-mockup-skills";
import { TracePanel } from "./review-mockup-trace";

const TABS: {
  value: ReviewMockupTab;
  label: string;
  icon: typeof Sparkles;
}[] = [
  { value: "assistant", label: "Assistant", icon: MessageSquare },
  { value: "skills", label: "Skills", icon: Sparkles },
  { value: "playbooks", label: "Playbooks", icon: BookOpen },
  { value: "agents", label: "Agents", icon: WalletCards },
  { value: "trace", label: "Trace", icon: GitBranch },
];

export function ReviewMockupRail() {
  const { tab, setTab, chrome } = useReviewMockup();
  const { branding } = getCustomerPack();

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--card)]",
        chrome === "agent"
          ? "border-r border-[var(--border)]"
          : "border-l border-[var(--border)]"
      )}
      aria-label="Document review"
      data-testid="review-mockup-rail"
    >
      <div className="shrink-0 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <BrandLogo compact className="size-8" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">
              {branding.productNameShort}
            </p>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Review mode · sample protocol
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-[var(--muted-foreground)]">Detected</span>
          <span className="rounded-full bg-emerald-700/10 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            {REVIEW_MOCKUP_DOCUMENT.detectedType}
          </span>
          <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]">
            {REVIEW_MOCKUP_DOCUMENT.detectedClause}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "assistant" ? <AssistantPanel /> : null}
        {tab === "skills" ? <SkillsPanel /> : null}
        {tab === "playbooks" ? <PlaybooksPanel /> : null}
        {tab === "agents" ? <AgentsPanel /> : null}
        {tab === "trace" ? <TracePanel /> : null}
      </div>

      <nav
        className="grid shrink-0 grid-cols-5 border-t border-[var(--border)]"
        aria-label="Review tools"
      >
        {TABS.map((item) => {
          const Icon = item.icon;
          const selected = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              aria-pressed={selected}
              className={cn(
                "flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium",
                selected
                  ? "border-t-2 border-[var(--brand-600)] pt-[8px] text-[var(--brand-700)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
