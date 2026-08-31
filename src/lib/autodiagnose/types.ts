export type AutodiagnoseSource =
  | "deployment_status"
  | "vercel_webhook"
  | "runtime"
  | "manual";

export type AutodiagnoseCategory =
  | "not_a_bug"
  | "infra_config"
  | "third_party"
  | "build"
  | "runtime"
  | "ai"
  | "database";

export type AutodiagnoseAction = "skip" | "investigate";

export type AutodiagnoseConfidence = "high" | "medium" | "low";

export type VercelErrorEvent = {
  source: AutodiagnoseSource;
  environment: string | null;
  projectName: string | null;
  deploymentUrl: string | null;
  logUrl: string | null;
  sha: string | null;
  ref: string | null;
  text: string;
};

export type ClassifyResult = {
  action: AutodiagnoseAction;
  category: AutodiagnoseCategory;
  reason: string;
  confidence: AutodiagnoseConfidence;
  fingerprint: string;
};

export function assertNeverAutodiagnoseCategory(value: never): never {
  throw new Error(`Unhandled autodiagnose category: ${String(value)}`);
}

export function assertNeverAutodiagnoseAction(value: never): never {
  throw new Error(`Unhandled autodiagnose action: ${String(value)}`);
}
