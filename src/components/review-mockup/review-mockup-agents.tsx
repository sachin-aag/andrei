"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AGENT_CATEGORY_LABELS,
  agentById,
  agentsInCategory,
  allRecommendedFindings,
  countBySeverity,
  recommendedAgents,
  type AgentCategory,
  type ReviewAgent,
} from "@/lib/review-mockup/sample-data";
import { useReviewMockup } from "./review-mockup-state";
import {
  BackRow,
  FindingCard,
  MetaTable,
  SelectableCard,
  SeverityCount,
} from "./review-mockup-ui";

const CATEGORIES: AgentCategory[] = [
  "recommended",
  "qms",
  "design",
  "requirements",
];

function AgentList() {
  const { runAllRecommended, selectAgent, runState } = useReviewMockup();
  const [category, setCategory] = useState<AgentCategory>("recommended");
  const agents = agentsInCategory(category);
  const recommendedCount = recommendedAgents().length;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Prebuilt Word agents
        </p>
        <button
          type="button"
          onClick={runAllRecommended}
          disabled={runState === "running"}
          className="text-[11px] font-medium text-[var(--brand-500)] hover:underline disabled:opacity-50"
        >
          Run all {recommendedCount} recommended
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setCategory(value)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium",
              category === value
                ? "bg-[var(--brand-700)] text-white"
                : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
          >
            {AGENT_CATEGORY_LABELS[value]}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {agents.map((agent) => (
          <SelectableCard
            key={agent.id}
            title={agent.title}
            description={agent.description}
            icon={agent.icon}
            testId={`review-agent-${agent.id}`}
            onClick={() => selectAgent(agent.id)}
            badges={
              <span className="rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                {agent.basis}
              </span>
            }
          />
        ))}
      </div>
    </div>
  );
}

function AgentRunProgress({ agent }: { agent: ReviewAgent }) {
  const { runStepIndex, runState } = useReviewMockup();
  return (
    <ol className="space-y-2 text-xs" data-testid="review-agent-progress">
      {agent.steps.map((step, index) => {
        const done = runState !== "idle" && index < runStepIndex;
        const current = runState === "running" && index === runStepIndex;
        return (
          <li key={step} className="flex items-start gap-2">
            {done ? (
              <Check className="mt-0.5 size-3.5 text-emerald-700" aria-hidden="true" />
            ) : (
              <span
                className={cn(
                  "mt-0.5 size-3.5 rounded-full border",
                  current
                    ? "border-[var(--brand-500)] bg-[var(--brand-100)]"
                    : "border-[var(--border)]"
                )}
                aria-hidden="true"
              />
            )}
            <span
              className={
                done || current
                  ? "text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)]"
              }
            >
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function AgentDetail({ agent }: { agent: ReviewAgent }) {
  const {
    selectAgent,
    runAgent,
    runState,
    runStepIndex,
    visibleFindings,
    selectedAgentId,
    ranAllRecommended,
    showFinding,
    applyFix,
    appliedFixIds,
  } = useReviewMockup();
  const thisRun =
    selectedAgentId === agent.id && !ranAllRecommended && runState !== "idle";
  const findings = thisRun && runState === "done" ? visibleFindings : [];
  const counts = countBySeverity(findings);

  return (
    <div>
      <BackRow label="All agents" onClick={() => selectAgent(null)} />
      <h2 className="text-base font-semibold">{agent.title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
        {agent.description}
      </p>
      <div className="mt-3">
        <MetaTable
          rows={[
            { label: "Basis", value: agent.basis },
            { label: "Scope", value: agent.scope },
            { label: "Runs on", value: agent.runsOn },
          ]}
        />
      </div>
      {runState === "idle" || selectedAgentId !== agent.id || ranAllRecommended ? (
        <Button
          type="button"
          className="mt-3 w-full"
          onClick={() => runAgent(agent.id)}
          data-testid="review-run-agent"
        >
          Run on DVP-0142
        </Button>
      ) : null}
      {thisRun && (runState === "running" || runStepIndex > 0) ? (
        <div className="mt-4">
          <AgentRunProgress agent={agent} />
        </div>
      ) : null}
      {thisRun && runState === "done" ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <SeverityCount severity="critical" count={counts.critical} />
            <SeverityCount severity="major" count={counts.major} />
            <SeverityCount severity="minor" count={counts.minor} />
          </div>
          {findings.map((finding) => (
            <FindingCard
              key={finding.id}
              severity={finding.severity}
              title={finding.title}
              location={finding.location}
              body={finding.body}
              suggestedReplacement={finding.suggestedReplacement}
              applied={appliedFixIds.includes(finding.id)}
              onShow={() => showFinding(finding.id)}
              onApply={
                finding.suggestedReplacement
                  ? () => applyFix(finding.id)
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReviewSummary() {
  const { visibleFindings, showFinding, applyFix, appliedFixIds, selectAgent } =
    useReviewMockup();
  const counts = countBySeverity(visibleFindings);
  return (
    <div data-testid="review-summary">
      <BackRow label="All agents" onClick={() => selectAgent(null)} />
      <h2 className="text-base font-semibold">Review summary: DVP-0142 Rev B</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
        {recommendedAgents().length} agents ran, sorted by severity. Resolve the
        critical items before routing for approval.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <SeverityCount severity="critical" count={counts.critical} />
        <SeverityCount severity="major" count={counts.major} />
        <SeverityCount severity="minor" count={counts.minor} />
      </div>
      <div className="mt-3 space-y-3">
        {allRecommendedFindings()
          .filter((finding) =>
            visibleFindings.some((item) => item.id === finding.id)
          )
          .map((finding) => (
            <FindingCard
              key={finding.id}
              severity={finding.severity}
              title={finding.title}
              location={finding.location}
              body={finding.body}
              suggestedReplacement={finding.suggestedReplacement}
              applied={appliedFixIds.includes(finding.id)}
              onShow={() => showFinding(finding.id)}
              onApply={
                finding.suggestedReplacement
                  ? () => applyFix(finding.id)
                  : undefined
              }
            />
          ))}
      </div>
    </div>
  );
}

export function AgentsPanel() {
  const { selectedAgentId, ranAllRecommended, runState } = useReviewMockup();
  if (ranAllRecommended && runState === "done" && !selectedAgentId) {
    return <ReviewSummary />;
  }
  if (ranAllRecommended && runState !== "idle" && !selectedAgentId) {
    const agent = agentById("traceability-gaps");
    return agent ? (
      <div>
        <h2 className="mb-3 text-base font-semibold">Running recommended agents</h2>
        <AgentRunProgress agent={agent} />
      </div>
    ) : null;
  }
  const agent = selectedAgentId ? agentById(selectedAgentId) : undefined;
  if (agent) return <AgentDetail agent={agent} />;
  return <AgentList />;
}
