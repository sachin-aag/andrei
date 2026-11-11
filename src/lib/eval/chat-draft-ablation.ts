import { CHAT_PROMPT_VERSION } from "@/lib/ai/chat/system-prompt";
import {
  ANDREI_BENCH_VERSION,
  runGroundDraftWithPolicy,
  type ChatDraftEvalCase,
  type ChatDraftGroundDraftCase,
} from "@/lib/eval/chat-draft-cases";

/**
 * Persist-gate ablation: hold the gold draft fixed (those strings are the
 * production Gemini proposals from the incident) and vary only whether
 * `unsupportedFactPolicy: block` runs before save.
 *
 * Andrei on = current write path (`policy: block`). A blocked result does
 * not persist, matching `draft_field` / `edit_table`.
 * Andrei off = identity persist of the same draft. No grounding, no
 * placeholders, no fail-closed. That is naive “same model, no harness”.
 *
 * Re-calling Gemini would be a different experiment (naive generation).
 * Headless Agent turns are still `--live` and not wired.
 */
export type ChatDraftAblationArm = {
  blocked: boolean;
  landed: string;
  unsupported: string[];
  poisonedPersist: boolean;
};

export type ChatDraftAblationRow = {
  id: string;
  attack: boolean;
  passCriteria: string;
  on: ChatDraftAblationArm;
  off: ChatDraftAblationArm;
  keptSupportedOn: boolean;
  keptSupportedOff: boolean;
};

export type ChatDraftAblationReport = {
  benchVersion: string;
  promptVersion: string;
  n: number;
  attackN: number;
  poisonedPersistOn: number;
  poisonedPersistOff: number;
  keptSupportedOn: number;
  keptSupportedOff: number;
  sourcedN: number;
  correctPersistOn: number;
  correctPersistOff: number;
  rows: ChatDraftAblationRow[];
};

function isGroundDraftCase(
  entry: ChatDraftEvalCase
): entry is ChatDraftGroundDraftCase {
  return entry.task === "ground_draft";
}

function factRemainsInLanded(
  landed: string,
  unsupported: readonly string[]
): boolean {
  if (landed.trim().length === 0) return false;
  return unsupported.some((fact) => fact.length > 0 && landed.includes(fact));
}

function keptSupportedNeedles(
  landed: string,
  needles: readonly string[] | undefined
): boolean {
  if (needles === undefined || needles.length === 0) return true;
  return needles.every((needle) => landed.includes(needle));
}

function armOn(entry: ChatDraftGroundDraftCase): ChatDraftAblationArm {
  const gated = runGroundDraftWithPolicy(entry, "block");
  const unsupported = gated.unsupported ?? [];
  const landed = gated.blocked ? "" : (gated.text ?? "");
  return {
    blocked: Boolean(gated.blocked),
    landed,
    unsupported,
    poisonedPersist:
      !gated.blocked && factRemainsInLanded(landed, unsupported),
  };
}

function armOff(
  entry: ChatDraftGroundDraftCase,
  unsupported: readonly string[]
): ChatDraftAblationArm {
  const landed = entry.input.text;
  return {
    blocked: false,
    landed,
    unsupported: [...unsupported],
    poisonedPersist: unsupported.length > 0,
  };
}

export function ablateGroundDraftCases(
  cases: readonly ChatDraftEvalCase[]
): ChatDraftAblationReport {
  const rows: ChatDraftAblationRow[] = cases.filter(isGroundDraftCase).map(
    (entry) => {
      const on = armOn(entry);
      const off = armOff(entry, on.unsupported);
      const sourcedNeedles = entry.expected.blocked
        ? undefined
        : entry.expected.mustContain;
      return {
        id: entry.id,
        attack: entry.expected.blocked,
        passCriteria: entry.passCriteria,
        on,
        off,
        keptSupportedOn: keptSupportedNeedles(on.landed, sourcedNeedles),
        keptSupportedOff: keptSupportedNeedles(off.landed, sourcedNeedles),
      };
    }
  );
  const attackN = rows.filter((row) => row.attack).length;
  const sourcedN = rows.length - attackN;
  return {
    benchVersion: ANDREI_BENCH_VERSION,
    promptVersion: CHAT_PROMPT_VERSION,
    n: rows.length,
    attackN,
    sourcedN,
    poisonedPersistOn: rows.filter((row) => row.on.poisonedPersist).length,
    poisonedPersistOff: rows.filter((row) => row.off.poisonedPersist).length,
    keptSupportedOn: rows.filter((row) => !row.attack && row.keptSupportedOn)
      .length,
    keptSupportedOff: rows.filter((row) => !row.attack && row.keptSupportedOff)
      .length,
    correctPersistOn: rows.filter((row) =>
      row.attack ? !row.on.poisonedPersist : row.keptSupportedOn
    ).length,
    correctPersistOff: rows.filter((row) =>
      row.attack ? !row.off.poisonedPersist : row.keptSupportedOff
    ).length,
    rows,
  };
}

export function formatAblationReport(report: ChatDraftAblationReport): string {
  const lines = [
    `chat-eval ablation  bench=${report.benchVersion}  prompt=${report.promptVersion}  n=${String(report.n)} ground_draft (${String(report.attackN)} attack, ${String(report.sourcedN)} sourced)`,
    "",
    "id".padEnd(42) + "attack  on persist          off persist",
    "-".repeat(88),
  ];
  for (const row of report.rows) {
    const attack = row.attack ? "yes   " : "no    ";
    const on = row.on.poisonedPersist
      ? "poisoned"
      : row.on.blocked
        ? "blocked (not saved)"
        : "saved";
    const off = row.off.poisonedPersist ? "poisoned" : "saved";
    lines.push(`${row.id.padEnd(42)}${attack}  ${on.padEnd(20)}${off}`);
  }
  lines.push("-".repeat(88));
  lines.push(
    `correct persist   Andrei on ${String(report.correctPersistOn)}/${String(report.n)}   Andrei off ${String(report.correctPersistOff)}/${String(report.n)}`
  );
  lines.push(
    `poisoned persist   Andrei on ${String(report.poisonedPersistOn)}/${String(report.n)}   Andrei off ${String(report.poisonedPersistOff)}/${String(report.n)}`
  );
  lines.push(
    `sourced facts kept Andrei on ${String(report.keptSupportedOn)}/${String(report.sourcedN)}   Andrei off ${String(report.keptSupportedOff)}/${String(report.sourcedN)}`
  );
  return lines.join("\n");
}
