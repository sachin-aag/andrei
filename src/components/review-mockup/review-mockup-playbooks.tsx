"use client";

import {
  countBySeverity,
  findingsByIds,
  playbookById,
  REVIEW_PLAYBOOKS,
} from "@/lib/review-mockup/sample-data";
import { useReviewMockup } from "./review-mockup-state";
import {
  BackRow,
  FindingCard,
  MetaTable,
  SelectableCard,
  SeverityCount,
} from "./review-mockup-ui";

function PlaybookList() {
  const { selectPlaybook } = useReviewMockup();
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Kestrel Medical playbooks
      </p>
      <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--secondary)]/50 px-3 py-2 text-xs text-[var(--muted-foreground)]">
        Playbooks turn <span className="font-medium text-[var(--foreground)]">your</span>{" "}
        SOPs, templates and past audit findings into checks, so reviews follow company
        rules and not just the standard.
      </p>
      <div className="space-y-2">
        {REVIEW_PLAYBOOKS.map((playbook) => (
          <SelectableCard
            key={playbook.id}
            title={playbook.title}
            description={playbook.source}
            icon={playbook.icon}
            testId={`review-playbook-${playbook.id}`}
            onClick={() => selectPlaybook(playbook.id)}
            badges={
              <>
                <span className="rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 text-[10px]">
                  {playbook.ruleCount} rules
                </span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 text-[10px]">
                  {playbook.ownerGroup}
                </span>
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}

function PlaybookDetail({ playbookId }: { playbookId: string }) {
  const { selectPlaybook, showFinding, applyFix, appliedFixIds } = useReviewMockup();
  const playbook = playbookById(playbookId);
  if (!playbook) return null;
  const findings = findingsByIds(playbook.findingIds);
  const counts = countBySeverity(findings);

  return (
    <div>
      <BackRow label="All playbooks" onClick={() => selectPlaybook(null)} />
      <h2 className="text-base font-semibold">{playbook.title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
        {playbook.source}
      </p>
      <div className="mt-3">
        <MetaTable
          rows={[
            { label: "Owner", value: playbook.owner },
            { label: "Updated", value: playbook.updated },
            { label: "Governance", value: playbook.governance },
          ]}
        />
      </div>
      <h3 className="mt-4 text-sm font-semibold">Sample rules</h3>
      <ul className="mt-2 space-y-2">
        {playbook.sampleRules.map((rule) => (
          <li
            key={rule.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs"
          >
            <span className="font-semibold text-[var(--brand-700)]">{rule.id}</span>{" "}
            {rule.text}
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-sm font-semibold">Results on DVP-0142</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <SeverityCount severity="critical" count={counts.critical} />
        <SeverityCount severity="major" count={counts.major} />
        <SeverityCount severity="minor" count={counts.minor} />
      </div>
      <div className="mt-3 space-y-3">
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
    </div>
  );
}

export function PlaybooksPanel() {
  const { selectedPlaybookId } = useReviewMockup();
  if (selectedPlaybookId) {
    return <PlaybookDetail playbookId={selectedPlaybookId} />;
  }
  return <PlaybookList />;
}
