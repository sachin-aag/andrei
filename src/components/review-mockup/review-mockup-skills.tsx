"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DV_MATRIX_ROWS,
  REVIEW_SKILLS,
  skillById,
} from "@/lib/review-mockup/sample-data";
import { useReviewMockup } from "./review-mockup-state";
import { BackRow, MetaTable, SelectableCard } from "./review-mockup-ui";

function SkillPrompt() {
  const { showSkillPrompt, skillCreated, dismissSkillPrompt, createSkill } =
    useReviewMockup();
  if (!showSkillPrompt || skillCreated) return null;
  return (
    <div
      className="rounded-lg border border-emerald-700/20 bg-emerald-700/10 p-3"
      data-testid="review-skill-prompt"
    >
      <p className="text-xs leading-relaxed text-emerald-950">
        <span className="font-semibold">Suggested skill.</span> You’ve copied
        requirement IDs and acceptance criteria from DV protocols into a DVR sheet 6
        times in the last 30 days. Save that as a one-click skill?
      </p>
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" onClick={createSkill}>
          Create skill
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={dismissSkillPrompt}>
          Not now
        </Button>
      </div>
    </div>
  );
}

function SkillList() {
  const { selectSkill, skillCreated } = useReviewMockup();
  return (
    <div className="space-y-3">
      <SkillPrompt />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        My skills · Aditya
      </p>
      <div className="space-y-2">
        {REVIEW_SKILLS.map((skill) => (
          <SelectableCard
            key={skill.id}
            title={skill.title}
            description={skill.description}
            icon={skill.icon}
            testId={`review-skill-${skill.id}`}
            onClick={() => selectSkill(skill.id)}
            badges={
              <>
                <span className="rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 text-[10px]">
                  {skill.runs} runs
                </span>
                {skillCreated && skill.id === "dv-matrix" ? (
                  <span className="rounded-full bg-emerald-700/15 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                    Just saved
                  </span>
                ) : null}
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}

function SkillDetail({ skillId }: { skillId: string }) {
  const { selectSkill } = useReviewMockup();
  const skill = skillById(skillId);
  if (!skill) return null;
  const showMatrix = skill.id === "dv-matrix";

  return (
    <div>
      <BackRow label="All skills" onClick={() => selectSkill(null)} />
      <h2 className="text-base font-semibold">{skill.title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
        {skill.description}
      </p>
      <div className="mt-3">
        <MetaTable
          rows={[
            { label: "Input", value: skill.input },
            { label: "Output", value: skill.output },
            { label: "Used", value: `${skill.runs} times` },
          ]}
        />
      </div>
      {showMatrix ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Extracted from DVP-0142</h3>
          <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[360px] text-left text-[10px]">
              <thead className="bg-[var(--secondary)] text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Test</th>
                  <th className="px-2 py-1.5 font-semibold">Input</th>
                  <th className="px-2 py-1.5 font-semibold">Method</th>
                  <th className="px-2 py-1.5 font-semibold">n</th>
                  <th className="px-2 py-1.5 font-semibold">Criterion</th>
                  <th className="px-2 py-1.5 font-semibold">Flag</th>
                </tr>
              </thead>
              <tbody>
                {DV_MATRIX_ROWS.map((row) => (
                  <tr key={row.test} className="border-t border-[var(--border)]">
                    <td className="px-2 py-1.5 font-medium">{row.test}</td>
                    <td className="px-2 py-1.5">{row.input}</td>
                    <td className="px-2 py-1.5">{row.method}</td>
                    <td className="px-2 py-1.5">{row.n}</td>
                    <td className="px-2 py-1.5">{row.criterion}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={cn(
                          "font-medium",
                          row.flagTone === "ok" && "text-emerald-700",
                          row.flagTone === "warning" && "text-amber-700",
                          row.flagTone === "danger" && "text-red-700"
                        )}
                      >
                        {row.flag}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => toast.success("Matrix inserted below §7 Test methods")}
            >
              Insert in document
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => toast.success("Sent 4 rows to DVR_tracker.xlsx")}
            >
              Send to DVR_tracker.xlsx
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(
                  DV_MATRIX_ROWS.map((row) =>
                    [row.test, row.input, row.method, row.n, row.criterion, row.flag].join(
                      "\t"
                    )
                  ).join("\n")
                );
                toast.success("Copied matrix");
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-[var(--muted-foreground)]">
          Run this skill from a real document to extract live rows. This prototype
          shows the DV matrix extract on “DV test matrix → Excel”.
        </p>
      )}
    </div>
  );
}

export function SkillsPanel() {
  const { selectedSkillId } = useReviewMockup();
  if (selectedSkillId) return <SkillDetail skillId={selectedSkillId} />;
  return <SkillList />;
}
