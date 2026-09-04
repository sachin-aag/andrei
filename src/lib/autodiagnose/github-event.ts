import type { AutodiagnoseSource, VercelErrorEvent } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nestedString(
  obj: Record<string, unknown> | null,
  path: string[]
): string | null {
  let current: unknown = obj;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[key];
  }
  return asString(current);
}

function emptyEvent(source: AutodiagnoseSource): VercelErrorEvent {
  return {
    source,
    environment: null,
    projectName: null,
    deploymentUrl: null,
    logUrl: null,
    sha: null,
    ref: null,
    text: "",
  };
}

function fromVercelWebhook(payload: Record<string, unknown>): VercelErrorEvent {
  const inner = asRecord(payload.payload) ?? payload;
  const deployment = asRecord(inner.deployment);
  const links = asRecord(inner.links);
  const meta = asRecord(deployment?.meta);
  const target = asString(inner.target);
  const environment =
    target === "production"
      ? "production"
      : target === "staging"
        ? "staging"
        : asString(inner.environment);
  const textParts = [
    asString(payload.type),
    asString(inner.errorMessage),
    asString(inner.error),
    asString(deployment?.readyState),
    nestedString(meta, ["githubCommitMessage"]),
  ].filter(Boolean);

  return {
    source: "vercel_webhook",
    environment,
    projectName:
      asString(deployment?.name) ?? nestedString(asRecord(inner.project), ["name"]),
    deploymentUrl: asString(deployment?.url),
    logUrl: asString(links?.deployment),
    sha:
      nestedString(meta, ["githubCommitSha"]) ??
      asString(inner.sha),
    ref:
      nestedString(meta, ["githubCommitRef"]) ??
      asString(inner.ref),
    text: textParts.join("\n"),
  };
}

function fromDeploymentStatus(payload: Record<string, unknown>): VercelErrorEvent {
  const deployment = asRecord(payload.deployment);
  const status = asRecord(payload.deployment_status);
  const environment =
    asString(status?.environment) ?? asString(deployment?.environment);
  const textParts = [
    asString(status?.state),
    asString(status?.description),
    asString(payload.description),
  ].filter(Boolean);

  return {
    source: "deployment_status",
    environment,
    projectName: environment,
    deploymentUrl:
      asString(status?.environment_url) ?? asString(deployment?.payload),
    logUrl: asString(status?.log_url),
    sha: asString(deployment?.sha),
    ref: asString(deployment?.ref),
    text: textParts.join("\n"),
  };
}

function fromClientPayload(payload: Record<string, unknown>): VercelErrorEvent {
  const client = asRecord(payload.client_payload) ?? payload;
  const sourceRaw = asString(client.source);
  const source: AutodiagnoseSource =
    sourceRaw === "runtime" ||
    sourceRaw === "vercel_webhook" ||
    sourceRaw === "deployment_status" ||
    sourceRaw === "manual"
      ? sourceRaw
      : "runtime";

  return {
    source,
    environment: asString(client.environment),
    projectName:
      asString(client.projectName) ?? asString(client.project),
    deploymentUrl:
      asString(client.deploymentUrl) ?? asString(client.host),
    logUrl: asString(client.logUrl),
    sha: asString(client.sha),
    ref: asString(client.ref) ?? asString(client.branch),
    text:
      asString(client.text) ??
      asString(client.error) ??
      asString(client.message) ??
      asString(client.log) ??
      "",
  };
}

function fromManualEnv(env: NodeJS.ProcessEnv): VercelErrorEvent {
  return {
    source: "manual",
    environment: env.INPUT_ENVIRONMENT?.trim() || "production",
    projectName: env.INPUT_PROJECT_NAME?.trim() || null,
    deploymentUrl: env.INPUT_DEPLOYMENT_URL?.trim() || null,
    logUrl: env.INPUT_LOG_URL?.trim() || null,
    sha: env.INPUT_SHA?.trim() || env.GITHUB_SHA?.trim() || null,
    ref: env.INPUT_REF?.trim() || env.GITHUB_REF_NAME?.trim() || null,
    text: env.INPUT_ERROR_TEXT?.trim() || "",
  };
}

export function parseAutodiagnoseEvent(input: {
  eventName?: string | null;
  payload: unknown;
  env?: NodeJS.ProcessEnv;
}): VercelErrorEvent {
  const env = input.env ?? process.env;
  const eventName = input.eventName ?? env.GITHUB_EVENT_NAME ?? "";
  const payload = asRecord(input.payload);

  if (eventName === "workflow_dispatch") {
    return fromManualEnv(env);
  }

  if (!payload) {
    if (eventName === "repository_dispatch" || eventName === "deployment_status") {
      return emptyEvent(
        eventName === "deployment_status" ? "deployment_status" : "runtime"
      );
    }
    return fromManualEnv(env);
  }

  if (eventName === "deployment_status" || payload.deployment_status) {
    return fromDeploymentStatus(payload);
  }

  const type = asString(payload.type);
  if (
    eventName === "repository_dispatch" ||
    payload.client_payload ||
    type === "vercel-error"
  ) {
    if (type === "deployment.error" || type === "deployment-error") {
      return fromVercelWebhook(payload);
    }
    return fromClientPayload(payload);
  }

  if (type === "deployment.error" || type === "deployment-error") {
    return fromVercelWebhook(payload);
  }

  return fromClientPayload(payload);
}
