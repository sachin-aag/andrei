import { fingerprintMarker } from "./fingerprint";
import type { ClassifyResult } from "./types";
import { assertNeverAutodiagnoseAction } from "./types";

export type LaunchDecision =
  | { action: "skip"; reason: string }
  | { action: "launch"; reason: string };

export function decideAutodiagnoseLaunch(input: {
  classification: ClassifyResult;
  existingOpenPrs: string[];
  existingCommitComments: string[];
  cursorApiKeyPresent: boolean;
}): LaunchDecision {
  switch (input.classification.action) {
    case "skip":
      return { action: "skip", reason: input.classification.reason };
    case "investigate":
      break;
    default:
      return assertNeverAutodiagnoseAction(input.classification.action);
  }

  if (!input.cursorApiKeyPresent) {
    return {
      action: "skip",
      reason:
        "CURSOR_API_KEY is not set — add it as a GitHub Actions secret, or use the Cursor Automation webhook instead",
    };
  }

  const marker = fingerprintMarker(input.classification.fingerprint);
  const alreadyOpen = input.existingOpenPrs.some((text) => text.includes(marker));
  if (alreadyOpen) {
    return {
      action: "skip",
      reason: `An open PR already covers fingerprint ${input.classification.fingerprint}`,
    };
  }

  const alreadyLaunched = input.existingCommitComments.some((text) =>
    text.includes(marker)
  );
  if (alreadyLaunched) {
    return {
      action: "skip",
      reason: `A Cursor agent was already launched for fingerprint ${input.classification.fingerprint} on this commit`,
    };
  }

  return {
    action: "launch",
    reason: input.classification.reason,
  };
}

export function buildCursorCreateAgentBody(input: {
  prompt: string;
  repository: string;
  startingRef: string;
}): {
  prompt: { text: string };
  name: string;
  repos: Array<{ url: string; startingRef: string }>;
  autoCreatePR: true;
  skipReviewerRequest: true;
} {
  return {
    prompt: { text: input.prompt },
    name: "Vercel error autodiagnose",
    repos: [
      {
        url: input.repository,
        startingRef: input.startingRef,
      },
    ],
    autoCreatePR: true,
    skipReviewerRequest: true,
  };
}
