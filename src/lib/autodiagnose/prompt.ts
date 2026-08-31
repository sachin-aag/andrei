import { fingerprintComment } from "./fingerprint";
import type { ClassifyResult, VercelErrorEvent } from "./types";
import { assertNeverAutodiagnoseCategory } from "./types";

function categoryPlaybook(category: ClassifyResult["category"]): string {
  switch (category) {
    case "build":
      return "Reproduce the compile/type error, fix the application code, add a focused test.";
    case "runtime":
      return "Match the stack to a route or component, confirm with PostHog $exception events, then fix the null/timeout/500.";
    case "ai":
      return "Pull the Langfuse trace around the timestamp, then fix the application path (not a model-provider outage). Caught chat stream errors are in-scope unless they are an upstream 429/quota.";
    case "database":
      return "Read the Neon error (read-only). If it is a query/schema bug in this repo, fix the SQL or Drizzle usage. Do not rewrite production data.";
    case "not_a_bug":
    case "infra_config":
    case "third_party":
      return "Do not open a PR. Leave a short note explaining why this is not an application bug.";
    default:
      return assertNeverAutodiagnoseCategory(category);
  }
}

export function buildAutodiagnoseAgentPrompt(input: {
  event: VercelErrorEvent;
  classification: ClassifyResult;
  repository: string;
}): string {
  const { event, classification, repository } = input;
  const lines = [
    "You are the Andrei production autodiagnose agent.",
    "A Vercel error was classified as a likely application bug. Diagnose it, fix it in this repository, and open a **draft** pull request. Do not merge. Do not push to main.",
    "",
    "Follow `.agents/skills/vercel-error-autodiagnose/SKILL.md` and `.agents/skills/pr-human-tester-checklist/SKILL.md`.",
    "",
    "## Event",
    `- Repository: ${repository}`,
    `- Source: ${event.source}`,
    `- Environment: ${event.environment ?? "(unknown)"}`,
    `- Project: ${event.projectName ?? "(unknown)"}`,
    `- Git SHA: ${event.sha ?? "(unknown)"}`,
    `- Git ref: ${event.ref ?? "(unknown)"}`,
    `- Deployment URL: ${event.deploymentUrl ?? "(none)"}`,
    `- Log URL: ${event.logUrl ?? "(none)"}`,
    `- Classifier category: ${classification.category}`,
    `- Classifier confidence: ${classification.confidence}`,
    `- Classifier reason: ${classification.reason}`,
    `- Fingerprint: ${classification.fingerprint}`,
    "",
    "### Error text",
    "```",
    event.text.trim() || "(empty)",
    "```",
    "",
    "## What to do",
    "1. Re-read the error. If it is infra, a canceled deploy, Neon `28P01`, a missing env var, or an upstream quota/outage, **stop** and do not open a PR.",
    "2. Pull evidence:",
    "   - PostHog: `$exception` events and error-tracking issues around this time, plus a session replay if one exists. Redact emails.",
    "   - Langfuse: traces/observations with level ERROR for the same window (chat, evaluate, suggestions, ingest).",
    "   - Neon: read-only — confirm whether this is schema/query vs a dead preview compute. Do not write.",
    "   - Vercel logs if `VERCEL_TOKEN` is available (`vercel inspect --logs` / `vercel logs --level error`).",
    "3. " + categoryPlaybook(classification.category),
    "4. If you can fix it with high confidence, implement the smallest change, add/adjust tests, run `pnpm test --` on the touched files plus `pnpm typecheck` if types moved.",
    "5. Open a **draft** PR targeting `main` with:",
    `   - ${fingerprintComment(classification.fingerprint)} in the body`,
    "   - label `autodiagnose` if you can apply labels",
    "   - CEO fold + Summary + Test plan from the PR checklist skill",
    "   - A short diagnosis (what, where, evidence links, why this is a code bug)",
    "6. If you cannot fix it, still open a draft PR **only** when you found a concrete code defect and a partial fix. Otherwise stop with a comment on the failing commit and no PR.",
    "",
    "Do not treat customer-pack identity (`ANDREI_CUSTOMER`) as a bug. Do not disable Neon preview branching. Do not set `ALLOW_TEST_*` on Vercel.",
  ];
  return lines.join("\n");
}
